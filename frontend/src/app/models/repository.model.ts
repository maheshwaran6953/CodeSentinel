export interface Repository {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  url: string;
  lastUpdated: string;
  branches: number | null;
  isPrivate: boolean;
  isArchived?: boolean;
}

export interface WebhookStatus {
  status: 'pending' | 'installing' | 'completed' | 'failed';
  message: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface RepositoryLinkingState {
  currentStep: 1 | 2 | 3;
  repositories: Repository[];
  selectedRepository: Repository | null;
  webhookStatus: WebhookStatus;
  isLoading: boolean;
  error: string | null;
}
