import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FacultyComponent } from './faculty.component';
import { AuthService } from '../services/auth.service';

describe('Faculty evidence dialog',()=>{
  beforeEach(async()=>{await TestBed.configureTestingModule({imports:[CommonModule,FormsModule,HttpClientTestingModule,RouterTestingModule],declarations:[FacultyComponent],providers:[{provide:AuthService,useValue:{logout:()=>{}}}]}).compileComponents();});
  it('opens evidence in a modal and ignores an answer arriving after close',()=>{
    const fixture=TestBed.createComponent(FacultyComponent),http=TestBed.inject(HttpTestingController);
    fixture.detectChanges();http.expectOne('/faculty/students').flush([]);http.expectOne('/faculty/provider-status').flush({});
    fixture.componentInstance.openCommit('test-commit');fixture.detectChanges();
    const dialog:HTMLDialogElement=fixture.nativeElement.querySelector('dialog');expect(dialog.open).toBeTrue();
    fixture.componentInstance.closeEvidence();expect(dialog.open).toBeFalse();
    http.expectOne('/faculty/commits/test-commit').flush({commit:{id:'test-commit'},questions:[],overrides:[]});
    expect(fixture.componentInstance.evidence).toBeNull();http.verify();fixture.destroy();
  });
  it('keeps the evidence, questions and review form inside the dialog',()=>{
    const fixture=TestBed.createComponent(FacultyComponent),http=TestBed.inject(HttpTestingController);
    fixture.detectChanges();http.expectOne('/faculty/students').flush([]);http.expectOne('/faculty/provider-status').flush({});
    fixture.componentInstance.openCommit('test-commit');
    http.expectOne('/faculty/commits/test-commit').flush({commit:{id:'test-commit',message:'A real feature'},questions:[],overrides:[]});fixture.detectChanges();
    const dialog:HTMLDialogElement=fixture.nativeElement.querySelector('dialog');expect(dialog.textContent).toContain('A real feature');expect(dialog.querySelector('form')).not.toBeNull();
    fixture.componentInstance.closeEvidence();http.verify();fixture.destroy();
  });
});
