import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RecoveryService } from './services/recovery.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: false
})
export class AppComponent {
  title = 'CodeSentinel';
  constructor(public recovery:RecoveryService,private router:Router) {
    recovery.expired$.subscribe(expired=>{
      if(expired)document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>dialog.close());
    });
  }
  get sessionRequired() {return this.recovery.expired$.value && !/^\/(login|auth\/callback)(\?|$)/.test(this.router.url);}
}
