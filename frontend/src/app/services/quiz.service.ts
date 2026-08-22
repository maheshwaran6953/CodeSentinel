import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { QuizSession, LLMGradingResult, UserAnswer } from '../models/quiz.model';

@Injectable({
  providedIn: 'root'
})
export class QuizService {
  private mockSession: QuizSession = {
    id: 'quiz-101',
    title: 'Integrity Quiz Interrogation',
    totalQuestions: 3,
    currentQuestionIndex: 0,
    status: 'in_progress',
    questions: [
      {
        id: 'q1',
        questionText: 'Why did you use a singleton pattern for the database connection instead of a connection pool?',
        codeSnippet: `class DatabaseConnection {\n  private static instance: DatabaseConnection;\n\n  private constructor() {\n    // Initialize connection\n  }\n\n  public static getInstance(): DatabaseConnection {\n    if (!DatabaseConnection.instance) {\n      DatabaseConnection.instance = new DatabaseConnection();\n    }\n    return DatabaseConnection.instance;\n  }\n}`,
        commitSha: 'abc1234...',
        commitMessage: 'Added authentication module',
        commitRepo: 'core-backend',
        commitTimeAgo: 'Committed 2 days ago',
        minCharCount: 20,
        maxCharCount: 1000
      },
      {
        id: 'q2',
        questionText: 'How does the auth token validation middleware handle expired JWT signatures?',
        codeSnippet: `export function verifyToken(req: Request, res: Response, next: NextFunction) {\n  const token = req.headers['authorization']?.split(' ')[1];\n  if (!token) return res.status(401).json({ error: 'No token provided' });\n\n  jwt.verify(token, process.env.JWT_SECRET!, (err, decoded) => {\n    if (err) return res.status(403).json({ error: 'Failed to authenticate token' });\n    req.user = decoded;\n    next();\n  });\n}`,
        commitSha: 'dcf4567...',
        commitMessage: 'Implemented database schema & auth middleware',
        commitRepo: 'core-backend',
        commitTimeAgo: 'Committed 3 days ago',
        minCharCount: 20,
        maxCharCount: 1000
      },
      {
        id: 'q3',
        questionText: 'Explain why you chose asynchronous event emitting for logging instead of inline synchronous file writes.',
        codeSnippet: `export class LoggerService {\n  private logEmitter = new EventEmitter();\n\n  constructor() {\n    this.logEmitter.on('log', (data) => {\n      fs.appendFile('app.log', JSON.stringify(data) + '\\n', () => {});\n    });\n  }\n\n  public log(message: string): void {\n    this.logEmitter.emit('log', { timestamp: new Date(), message });\n  }\n}`,
        commitSha: 'ef78901...',
        commitMessage: 'Added asynchronous audit logging service',
        commitRepo: 'core-backend',
        commitTimeAgo: 'Committed 4 days ago',
        minCharCount: 20,
        maxCharCount: 1000
      }
    ],
    answers: {}
  };

  constructor() {}

  /**
   * Fetch current active quiz interrogation session
   */
  getQuizSession(): Observable<QuizSession> {
    return of(this.mockSession);
  }

  /**
   * Submit answer for LLM evaluation (simulates server-side Groq LLM call)
   */
  submitAnswer(questionId: string, answerText: string): Observable<LLMGradingResult> {
    // Generate realistic dynamic score based on explanation length & detail
    const textLength = answerText.trim().length;
    let score = 85;
    let feedback = 'Good technical reasoning provided for static instance handling.';
    let status: 'passed' | 'needs_improvement' | 'failed' = 'passed';

    if (textLength < 40) {
      score = 60;
      status = 'needs_improvement';
      feedback = 'Explanation is brief. Mentioning thread-safety and connection limits would strengthen your answer.';
    } else if (textLength > 150) {
      score = 95;
      status = 'passed';
      feedback = 'Excellent technical depth! Clear explanation of lifecycle management and resource control.';
    }

    const result: LLMGradingResult = {
      score,
      feedback,
      status
    };

    // Save answer to mock session
    this.mockSession.answers[questionId] = {
      questionId,
      answerText,
      result,
      submittedAt: new Date().toISOString(),
      isDraft: false
    };

    // Simulate 2.5 second Groq LLM API grading response
    return of(result).pipe(delay(2500));
  }

  /**
   * Save answer as a draft locally
   */
  saveDraft(questionId: string, answerText: string): Observable<boolean> {
    this.mockSession.answers[questionId] = {
      questionId,
      answerText,
      isDraft: true
    };
    return of(true);
  }
}
