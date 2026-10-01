import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Database } from './database';

export function capacityWait(at:number,message='Waiting for API capacity. Your saved work will be retried automatically.') {
 const error=new ServiceUnavailableException(message);
 Object.assign(error,{retryable:true,retryAt:at,capacityDeferred:true});return error;
}
export function resetMilliseconds(value:unknown):number|null {
 if(typeof value!=='string' || !/^(?:\d+(?:\.\d+)?(?:ms|s|m|h|d))+$/.test(value))return null;
 const units:Record<string,number>={ms:1,s:1000,m:60000,h:3600000,d:86400000};
 return [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)].reduce((n,m)=>n+Number(m[1])*units[m[2]],0);
}
@Injectable()
export class GroqCapacity {
 constructor(private db:Database) {}
 async status() {
  const [r]=await this.db.query("SELECT observed,retry_at,lease_until FROM llm_capacity WHERE scope='groq'");
  return {...(r?.observed || {}),retryAt:r?.retry_at && new Date(r.retry_at).getTime()>Date.now()?r.retry_at:null,
   busy:!!(r?.lease_until && new Date(r.lease_until).getTime()>Date.now()),
   scope:'Shared PostgreSQL observations for this deployment; provider limits are organization-wide. Other applications are not controlled. Unknown or stale values are not a billing balance.'};
 }
 async run<T>(key:string,model:string,execute:()=>Promise<T>,observation:()=>Record<string,unknown>|null):Promise<T> {
  const lease=randomUUID();
  const acquired=await this.db.source.transaction(async tx=>{
   await tx.query("INSERT INTO llm_capacity(scope) VALUES ('groq') ON CONFLICT DO NOTHING");
   const [state]=await tx.query("SELECT * FROM llm_capacity WHERE scope='groq' FOR UPDATE");
   const [cached]=await tx.query('SELECT result FROM llm_results WHERE request_key=$1',[key]);
   if(cached)return {cached:true,value:cached.result};
   const until=Math.max(new Date(state.retry_at || 0).getTime(),new Date(state.lease_until || 0).getTime());
   if(until>Date.now())throw capacityWait(until);
   await tx.query("UPDATE llm_capacity SET lease_id=$1,lease_until=now()+interval '90 seconds' WHERE scope='groq'",[lease]);
   return {cached:false,value:null};
  });
  if(acquired.cached)return acquired.value;
  try {
   const value=await execute();
   await this.db.source.transaction(async tx=>{
    const owned=await tx.query("SELECT scope FROM llm_capacity WHERE scope='groq' AND lease_id=$1 FOR UPDATE",[lease]);
    if(!owned.length)throw capacityWait(Date.now()+30000);
    await tx.query('INSERT INTO llm_results(request_key,result) VALUES ($1,$2) ON CONFLICT DO NOTHING',[key,JSON.stringify(value)]);
    await this.release(tx,lease,model,observation(),0);
   });
   return value;
  } catch(error) {
   await this.release(this.db,lease,model,observation(),(error as any)?.retryAt || 0);
   throw error;
  }
 }
 private async release(tx:{query:Function},lease:string,model:string,observed:Record<string,unknown>|null,retryAt:number) {
  const next=Math.max(retryAt,Number(observed?.capacityRetryAt || 0));
  await tx.query(`UPDATE llm_capacity SET observed=CASE WHEN $2::jsonb IS NULL THEN observed ELSE
   observed || $2::jsonb || jsonb_build_object('observedModel',$3::text,'deploymentRequests',coalesce((observed->>'deploymentRequests')::bigint,0)+1,
    'deploymentTokens',coalesce((observed->>'deploymentTokens')::bigint,0)+$4::bigint) END,
   retry_at=CASE WHEN $5::bigint>0 THEN to_timestamp($5::double precision/1000) ELSE NULL END,
   lease_id=NULL,lease_until=NULL WHERE scope='groq' AND lease_id=$1`,
   [lease,observed?JSON.stringify(observed):null,model,Number(observed?.usageTokens || 0),next]);
 }
}
