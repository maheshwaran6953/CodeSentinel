import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { QuizInterrogationComponent } from './quiz-interrogation.component';
import { QuizService } from '../../services/quiz.service';
import { QuizSession, LLMGradingResult } from '../../models/quiz.model';

describe('QuizInterrogationComponent', () => {
  let component: QuizInterrogationComponent;
  let fixture: ComponentFixture<QuizInterrogationComponent>;
  let mockQuizService: jasmine.SpyObj<QuizService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockSession: QuizSession = {
    id: 'quiz-101',
    title: 'Integrity Quiz Interrogation',
    totalQuestions: 2,
    currentQuestionIndex: 0,
    status: 'in_progress',
    questions: [
      {
        id: 'q1',
        questionText: 'Why did you use singleton pattern for DB connection?',
        codeSnippet: 'class DB { static instance; }',
        commitSha: 'abc1234',
        commitMessage: 'Added DB connection',
        commitRepo: 'backend',
        commitTimeAgo: '2 days ago',
        minCharCount: 20,
        maxCharCount: 1000
      },
      {
        id: 'q2',
        questionText: 'How does token validation work?',
        codeSnippet: 'jwt.verify(token)',
        commitSha: 'dcf4567',
        commitMessage: 'Added auth',
        commitRepo: 'backend',
        commitTimeAgo: '3 days ago',
        minCharCount: 20,
        maxCharCount: 1000
      }
    ],
    answers: {}
  };

  const mockResult: LLMGradingResult = {
    score: 90,
    feedback: 'Excellent explanation',
    status: 'passed'
  };

  beforeEach(async () => {
    mockQuizService = jasmine.createSpyObj('QuizService', ['getQuizSession', 'submitAnswer', 'saveDraft']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    mockQuizService.getQuizSession.and.returnValue(of(mockSession));
    mockQuizService.submitAnswer.and.returnValue(of(mockResult));
    mockQuizService.saveDraft.and.returnValue(of(true));

    await TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [QuizInterrogationComponent],
      providers: [
        { provide: QuizService, useValue: mockQuizService },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(QuizInterrogationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load quiz session on init', () => {
    expect(component.quizSession).toEqual(mockSession);
    expect(component.currentQuestionIndex).toBe(0);
    expect(component.currentQuestion?.id).toBe('q1');
  });

  it('should validate answer character count correctly', () => {
    component.answerText = 'Short answer';
    expect(component.charCount).toBe(12);
    expect(component.isValidAnswer).toBeFalse();

    component.answerText = 'This is a long valid technical answer explaining the singleton database pattern.';
    expect(component.isValidAnswer).toBeTrue();
  });

  it('should handle LLM grading submission and show feedback', () => {
    jasmine.clock().install();
    component.answerText = 'This is a valid technical explanation for using singleton database connection.';
    component.submitAnswer();

    expect(mockQuizService.submitAnswer).toHaveBeenCalledWith('q1', component.answerText);

    jasmine.clock().tick(100);
    expect(component.isGrading).toBeFalse();
    expect(component.showFeedback).toBeTrue();
    expect(component.currentResult).toEqual(mockResult);

    jasmine.clock().tick(1600); // auto-advance timer
    expect(component.currentQuestionIndex).toBe(1);
    jasmine.clock().uninstall();
  });

  it('should save draft', () => {
    component.answerText = 'Draft answer text here';
    component.saveDraft();
    expect(mockQuizService.saveDraft).toHaveBeenCalledWith('q1', 'Draft answer text here');
  });

  it('should navigate to dashboard on back when no unsaved text', () => {
    component.answerText = '';
    component.handleBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/student/dashboard']);
  });

  it('should show confirm exit modal when back clicked with unsubmitted text', () => {
    component.answerText = 'Unsaved typed text here...';
    component.showFeedback = false;
    component.handleBack();
    expect(component.showConfirmExitModal).toBeTrue();

    component.confirmExit();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/student/dashboard']);
  });
});
