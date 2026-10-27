import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({providedIn:'root'})
export class RecoveryService {
  readonly expired$ = new BehaviorSubject(false);
  authenticated = false;
  unavailable = false;
  signedIn() { this.authenticated=true; this.expired$.next(false); this.unavailable=false; }
  signedOut() { this.authenticated=false; this.expired$.next(false); }
  expire() {
    if (!this.authenticated) return;
    this.authenticated=false;
    this.expired$.next(true);
  }
}
