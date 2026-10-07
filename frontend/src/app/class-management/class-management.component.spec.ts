import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ClassManagementComponent } from './class-management.component';
import { parseRoster } from './roster-import';

describe('Roster import validation',()=>{
  it('preserves register numbers as strings and parses Markdown or quoted CSV',()=>{
    expect(parseRoster('| Reg.no | Name |\n| --- | --- |\n| 00123 | A   Student |')).toEqual([{registerNumber:'00123',name:'A Student'}]);
    expect(parseRoster('Register number,Name,GitHub\n00124,"Student, B",@student-b')).toEqual([{registerNumber:'00124',name:'Student, B',githubLogin:'student-b'}]);
  });
  it('rejects duplicate or malformed rows rather than silently importing a subset',()=>{
    expect(()=>parseRoster('001,A\n001,B')).toThrowError(/Duplicate/);
    expect(()=>parseRoster('001,A\n002')).toThrowError(/Row 2/);
    expect(()=>parseRoster('001,"Missing quote')).toThrowError(/close/);
  });
});
describe('Faculty class administration',()=>{
  beforeEach(async()=>{await TestBed.configureTestingModule({imports:[ClassManagementComponent,HttpClientTestingModule,RouterTestingModule]}).compileComponents();});
  it('keeps the selected class visible after saving and refreshing its options',fakeAsync(()=>{
    const fixture=TestBed.createComponent(ClassManagementComponent),c=fixture.componentInstance,http=TestBed.inject(HttpTestingController);
    const cls={id:'class-1',department:'IT',section:'B',graduation_year:2027,can_manage:true};
    fixture.detectChanges();http.expectOne('/classes').flush({classes:[cls],faculty:[]});flushMicrotasks();fixture.detectChanges();
    const select:HTMLSelectElement=fixture.nativeElement.querySelector('.toolbar select');
    select.value='class-1';select.dispatchEvent(new Event('change'));flushMicrotasks();
    http.expectOne('/classes/class-1').flush({class:{...cls,team_member_limit:2},roster:[],teams:[],claims:[],faculty:[]});flushMicrotasks();fixture.detectChanges();flushMicrotasks();
    void c.saveLimit();fixture.detectChanges();http.expectOne('/classes/class-1/settings').flush({saved:true});flushMicrotasks();
    http.expectOne('/classes').flush({classes:[{...cls}],faculty:[]});flushMicrotasks();fixture.detectChanges();flushMicrotasks();
    http.expectOne('/classes/class-1').flush({class:{...cls,team_member_limit:2},roster:[],teams:[],claims:[],faculty:[]});flushMicrotasks();fixture.detectChanges();flushMicrotasks();
    expect(c.selectedId).toBe('class-1');expect(select.selectedOptions[0]?.textContent).toContain('IT');
    http.verify();fixture.destroy();
  }));
  it('previews locally and sends only reviewed student rows on explicit save',fakeAsync(()=>{
    const fixture=TestBed.createComponent(ClassManagementComponent),c=fixture.componentInstance,http=TestBed.inject(HttpTestingController);
    const classes=[{id:'class-1',department:'IT',section:'B',graduation_year:2027,can_manage:true}];
    fixture.detectChanges();http.expectOne('/classes').flush({classes,faculty:[]});flushMicrotasks();fixture.detectChanges();
    c.selectedId='class-1';c.rosterText='001,A Student';c.previewImport();http.expectNone('/classes/class-1/roster');
    void c.importRoster();const req=http.expectOne('/classes/class-1/roster');expect(req.request.body).toEqual({students:[{registerNumber:'001',name:'A Student'}]});req.flush({saved:true});flushMicrotasks();
    http.expectOne('/classes').flush({classes,faculty:[]});flushMicrotasks();http.expectOne('/classes/class-1').flush({class:{team_member_limit:2},roster:[],teams:[],claims:[],faculty:[]});flushMicrotasks();
    expect(c.preview).toEqual([]);http.verify();fixture.destroy();
  }));
  it('hides roster mutations and team assignment controls for a guide',()=>{
    const fixture=TestBed.createComponent(ClassManagementComponent),http=TestBed.inject(HttpTestingController);fixture.detectChanges();http.expectOne('/classes').flush({classes:[],faculty:[]});
    fixture.componentInstance.detail={class:{department:'IT',section:'B',graduation_year:2027,can_manage:false,team_member_limit:2},roster:[],teams:[],claims:[]};fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Guide access');expect(fixture.nativeElement.textContent).not.toContain('Add students');expect(fixture.nativeElement.textContent).not.toContain('Create approved team');fixture.destroy();http.verify();
  });
});
