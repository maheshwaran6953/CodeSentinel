import { Injectable } from '@angular/core';
import { HttpErrorResponse, HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import { catchError, tap, timeout } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { RecoveryService } from './recovery.service';
@Injectable()
export class ApiInterceptor implements HttpInterceptor {
  constructor(private recovery:RecoveryService) {}
  intercept(request: HttpRequest<unknown>, next: HttpHandler) {
    if (!/^\/(auth|repositories|student|quizzes|faculty|notifications|classes|teams|health)(\/|$)/.test(request.url)) return next.handle(request);
    const base = ((window as any).__CODESENTINEL_CONFIG__?.apiUrl || '').replace(/\/$/,'');
    const authentication = /^\/auth\/(login|me|logout)(\?|$)/.test(request.url);
    if(this.recovery.expired$.value && !authentication && !request.url.startsWith('/health'))
      return throwError(()=>new HttpErrorResponse({status:401,error:{message:'Your session expired. Sign in again to continue.'}}));
    const response=next.handle(request.clone({url:base+request.url,withCredentials:true}));
    // Bound read-only loading. Mutations are never automatically retried or replayed.
    return (request.method==='GET'?response.pipe(timeout(20000)):response).pipe(
      tap(()=>this.recovery.unavailable=false),
      catchError(error=>{
        if(error.status===401 && !/^\/auth\/login(\?|$)/.test(request.url))this.recovery.expire();
        if(error.status===0 || [502,503,504].includes(error.status) || error.name==='TimeoutError')this.recovery.unavailable=true;
        return throwError(()=>error);
      })
    );
  }
}
