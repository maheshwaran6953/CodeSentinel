import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { RecoveryService } from './services/recovery.service';

@Component({selector:'app-notifications',template:'Private inbox',standalone:false})
class InboxStub {}
describe('Application recovery screen',()=>{
  beforeEach(async()=>{await TestBed.configureTestingModule({imports:[CommonModule,RouterTestingModule],declarations:[AppComponent,InboxStub]}).compileComponents();});
  it('conceals the old private screen and closes evidence dialogs after session expiry',()=>{
    const fixture=TestBed.createComponent(AppComponent),recovery=TestBed.inject(RecoveryService);
    const dialog=document.createElement('dialog');document.body.appendChild(dialog);dialog.showModal();
    fixture.detectChanges();recovery.signedIn();recovery.expire();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.recovery-screen')?.textContent).toContain('Sign in to continue');
    expect(fixture.nativeElement.querySelector('[hidden]')).not.toBeNull();expect(dialog.open).toBeFalse();
    dialog.remove();fixture.destroy();
  });
  it('warns about stale information during an outage without claiming the session expired',()=>{
    const fixture=TestBed.createComponent(AppComponent),recovery=TestBed.inject(RecoveryService);
    recovery.unavailable=true;fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.service-notice')?.textContent).toContain('out of date');
    expect(fixture.nativeElement.querySelector('.recovery-screen')).toBeNull();fixture.destroy();
  });
});
