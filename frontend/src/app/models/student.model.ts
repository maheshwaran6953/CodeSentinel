export interface CommitItem {
  sha: string;
  message: string;
  date: string;
  lines_added: number;
  score: number;
  status: 'normal' | 'flagged' | 'suspicious';
}

export interface RepositoryInfo {
  name: string;
  url: string;
  linked_at: string;
  is_linked: boolean;
}

export interface StudentDashboardData {
  authenticity_score: number;
  authenticity_level: 'High' | 'Moderate' | 'Low' | 'Critical';
  total_commits: number;
  avg_score: number;
  pending_quizzes: number;
  flagged_commits: number;
  repository: RepositoryInfo;
  recent_commits: CommitItem[];
}
