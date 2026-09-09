import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Repository, WebhookStatus } from '../models/repository.model';
@Injectable({providedIn:'root'})
export class RepositoryService {
  private selectedRepository: Repository | null = null;
  constructor(private http: HttpClient) {}
  getRepositories(): Observable<Repository[]> { return this.http.get<Repository[]>('/repositories'); }
  validateRepository(repo: Repository): Observable<boolean> { return of(!!repo && !repo.isArchived); }
  registerWebhook(repo: Repository): Observable<WebhookStatus> {
    return this.http.post<WebhookStatus>('/repositories/link',{repositoryId:repo.id}).pipe(tap(result=>{if(result.status==='completed') this.selectedRepository=repo;}));
  }
  getSelectedRepository(): Repository | null { return this.selectedRepository; }
}
