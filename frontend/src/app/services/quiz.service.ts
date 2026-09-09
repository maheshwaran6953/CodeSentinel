import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { QuizSession, LLMGradingResult } from '../models/quiz.model';
@Injectable({providedIn:'root'})
export class QuizService {
  constructor(private http: HttpClient) {}
  getQuizSession(): Observable<QuizSession | null> { return this.http.get<QuizSession | null>('/quizzes/active'); }
  submitAnswer(questionId: string, answerText: string): Observable<LLMGradingResult> {
    return this.http.post<LLMGradingResult>(`/quizzes/questions/${questionId}/answer`,{answerText});
  }
  saveDraft(questionId: string, answerText: string): Observable<boolean> {
    return this.http.post<boolean>(`/quizzes/questions/${questionId}/draft`,{answerText});
  }
}
