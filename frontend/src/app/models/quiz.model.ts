export interface Question {
  id: string;
  questionText: string;
  codeSnippet?: string;
  commitSha: string;
  commitMessage: string;
  commitRepo: string;
  commitTimeAgo: string;
  minCharCount: number;
  maxCharCount: number;
}

export interface LLMGradingResult {
  submittedAnswer?: string;
  score: number; // 0 to 100
  feedback: string;
  status: 'passed' | 'needs_improvement' | 'failed';
}

export interface UserAnswer {
  questionId: string;
  answerText: string;
  result?: LLMGradingResult;
  submittedAt?: string;
  isDraft?: boolean;
}

export interface QuizSession {
  id: string;
  title: string;
  totalQuestions: number;
  currentQuestionIndex: number;
  questions: Question[];
  answers: Record<string, UserAnswer>;
  status: 'not_started' | 'in_progress' | 'completed';
  totalScore?: number;
  avgScore?: number;
}
