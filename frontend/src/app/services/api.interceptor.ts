import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
@Injectable()
export class ApiInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler) {
    if (!/^\/(auth|repositories|student|quizzes|faculty)(\/|$)/.test(request.url)) return next.handle(request);
    const base = ((window as any).__CODESENTINEL_CONFIG__?.apiUrl || '').replace(/\/$/,'');
    return next.handle(request.clone({url:base+request.url,withCredentials:true}));
  }
}
