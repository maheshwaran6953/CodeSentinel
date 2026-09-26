import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { QuizService } from '../../services/quiz.service';
import { QuizSession, Question, LLMGradingResult, UserAnswer } from '../../models/quiz.model';

@Component({
  selector: 'app-quiz-interrogation',
  templateUrl: './quiz-interrogation.component.html',
  styleUrls: ['./quiz-interrogation.component.css'],
  standalone: false
})
export class QuizInterrogationComponent implements OnInit, OnDestroy {
  // Quiz State
  quizSession: QuizSession | null = null;
  currentQuestionIndex: number = 0;
  answerText: string = '';
  
  // UI & Loading States
  isLoading: boolean = true;
  error = '';
  isGrading: boolean = false;
  isSavingDraft: boolean = false;
  showDraftToast: boolean = false;
  showFeedback: boolean = false;
  currentResult: LLMGradingResult | null = null;
  
  // Completion & Summary State
  isCompleted: boolean = false;
  totalScore: number = 0;
  avgScore: number = 0;

  // Dialog State
  showConfirmExitModal: boolean = false;

  // Auto-advance Timer
  private autoAdvanceTimer: any = null;
  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadQuizSession();
  }

  ngOnDestroy(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Getter for current active question
   */
  get currentQuestion(): Question | null {
    if (!this.quizSession || !this.quizSession.questions) {
      return null;
    }
    return this.quizSession.questions[this.currentQuestionIndex] || null;
  }

  submissionUncertain = false;
  get answerLocked(): boolean {
    const answer = this.currentQuestion && this.quizSession?.answers[this.currentQuestion.id];
    return this.submissionUncertain || !!(answer && answer.isDraft === false);
  }

  /**
   * Real-time character count
   */
  get charCount(): number {
    return this.answerText ? this.answerText.length : 0;
  }

  /**
   * Real-time answer validation (minimum 20 characters)
   */
  get isValidAnswer(): boolean {
    const min = this.currentQuestion ? this.currentQuestion.minCharCount : 20;
    return this.answerText.trim().length >= min && this.answerText.length <= (this.currentQuestion?.maxCharCount || 1000);
  }

  /**
   * Progress bar percentage
   */
  get progressPercentage(): number {
    if (!this.quizSession || this.quizSession.totalQuestions === 0) return 0;
    if (this.isCompleted) return 100;
    return Math.round(((this.currentQuestionIndex + 1) / this.quizSession.totalQuestions) * 100);
  }

  /**
   * Load quiz interrogation session
   */
  loadQuizSession(): void {
    this.isLoading = true;
    this.quizService.getQuizSession()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (session) => {
          this.submissionUncertain = false;
          this.quizSession = session;
          this.currentQuestionIndex = session?.currentQuestionIndex || 0;
          this.loadExistingAnswer();
          this.isLoading = false;
        },
        error: (err) => {
          this.error = err.error?.message || 'Failed to load quiz session. Please retry.';
          this.isLoading = false;
        }
      });
  }

  /**
   * Load saved answer or draft if existing for current question
   */
  private loadExistingAnswer(): void {
    if (!this.quizSession || !this.currentQuestion) return;
    
    const existing = this.quizSession.answers[this.currentQuestion.id];
    if (existing) {
      this.answerText = existing.answerText || '';
      if (existing.result) {
        this.currentResult = existing.result;
        this.showFeedback = true;
      } else {
        this.currentResult = null;
        this.showFeedback = false;
      }
    } else {
      this.answerText = '';
      this.currentResult = null;
      this.showFeedback = false;
    }
  }

  /**
   * Submit Answer for LLM Grading
   */
  submitAnswer(): void {
    if (!this.isValidAnswer || !this.currentQuestion || this.isGrading || this.submissionUncertain) return;

    this.isGrading = true;
    this.error = '';
    this.showFeedback = false;
    const qId = this.currentQuestion.id;

    this.quizService.submitAnswer(qId, this.answerText)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.isGrading = false;
          this.currentResult = result;
          this.answerText = result.submittedAnswer ?? this.answerText;
          if (this.quizSession) this.quizSession.answers[qId] = { questionId: qId, answerText: this.answerText, result, isDraft: false, submittedAt: new Date().toISOString() };
          this.showFeedback = true;

          // Keep the exact answer and rationale visible until the student chooses Next.
        },
        error: (err) => {
          this.isGrading = false;
          this.error = err.error?.message || 'Submission status uncertain. Reload before retrying.';
          this.submissionUncertain = true;
          // Reconcile with the server before enabling edits/retry: a timeout may follow a saved submission.
          this.quizService.getQuizSession().pipe(takeUntil(this.destroy$)).subscribe({
            next: session => {
              if (session) { this.quizSession=session; this.submissionUncertain=false; this.loadExistingAnswer(); }
              else { this.loadQuizSession(); }
            }, error: () => { this.error='Unable to confirm the saved response. Reload before editing or retrying.'; }
          });
        }
      });
  }

  /**
   * Save Answer as Draft
   */
  saveDraft(): void {
    if (!this.currentQuestion || !this.answerText || this.answerLocked) return;

    this.isSavingDraft = true;
    this.quizService.saveDraft(this.currentQuestion.id, this.answerText)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSavingDraft = false;
          this.showDraftToast = true;
          setTimeout(() => {
            this.showDraftToast = false;
          }, 2000);
        },
        error: () => {
          this.isSavingDraft = false;
          this.error = 'Draft could not be saved. Please retry before leaving.';
        }
      });
  }

  /**
   * Move to next question or complete quiz
   */
  nextQuestion(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }

    if (!this.quizSession || !this.currentQuestion || !this.quizSession.answers[this.currentQuestion.id]?.result) return;

    if (this.currentQuestionIndex < this.quizSession.totalQuestions - 1) {
      this.currentQuestionIndex++;
      this.loadExistingAnswer();
      this.scrollTop();
    } else {
      this.calculateFinalScores();
      this.isCompleted = true;
      this.scrollTop();
    }
  }

  /**
   * Move to previous question
   */
  previousQuestion(): void {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.loadExistingAnswer();
      this.scrollTop();
    }
  }

  /**
   * Calculate supporting LLM rubric points upon quiz completion
   */
  calculateFinalScores(): void {
    if (!this.quizSession) return;

    const answers = Object.values(this.quizSession.answers);
    const graded = answers.filter(a => a.result);
    
    if (graded.length > 0) {
      const sum = graded.reduce((acc, curr) => acc + (curr.result?.score || 0), 0);
      this.totalScore = sum;
      this.avgScore = Math.round(sum / graded.length);
    } else {
      this.totalScore = 0;
      this.avgScore = 0;
    }
  }

  /**
   * Back button handler with unsaved changes check
   */
  handleBack(): void {
    if (this.isCompleted) {
      this.router.navigate(['/student/dashboard']);
      return;
    }

    if (this.answerText.trim().length > 0 && !this.showFeedback && !this.answerLocked) {
      this.showConfirmExitModal = true;
    } else {
      this.router.navigate(['/student/dashboard']);
    }
  }

  /**
   * Confirm leaving quiz
   */
  confirmExit(): void {
    this.showConfirmExitModal = false;
    this.router.navigate(['/student/dashboard']);
  }

  /**
   * Cancel exit modal
   */
  cancelExit(): void {
    this.showConfirmExitModal = false;
  }

  /**
   * Auto-scroll to top when advancing questions
   */
  private scrollTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
