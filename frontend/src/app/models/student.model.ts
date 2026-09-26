export interface CommitItem {
  evidence_status?: string;
  sha: string;
  message: string;
  date: string;
  lines_added: number;
  score: number | null;
  lines_deleted?: number;
  status: 'review_requested' | 'legacy_review' | 'normal' | 'flagged' | 'suspicious' | 'queued' | 'processing' | 'failed' | 'partial' | 'excluded';
}

export interface RepositoryInfo {
  name: string;
  url: string;
  linked_at: string;
  is_linked: boolean;
}

export interface StudentDashboardData {
  evidence_status?: string;
  baseline_status?: string;
  authenticity_score: number | null;
  authenticity_level: 'High' | 'Moderate' | 'Low' | 'Critical' | 'Learning';
  total_commits: number;
  avg_score: number | null;
  pending_quizzes: number;
  flagged_commits: number;
  repository: RepositoryInfo;
  recent_commits: CommitItem[];
}
