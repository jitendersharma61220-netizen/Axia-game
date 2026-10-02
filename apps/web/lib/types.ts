export interface Me {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN';
  ageMode: 'TEEN' | 'ADULT' | null;
  onboarded: boolean;
}

export interface GameSummary {
  slug: string;
  name: string;
  description: string;
  templateKey: string;
  howToPlay: string[];
  estMinutes: number;
  attemptsPerDay: number;
  attemptsLeft: number | null;
  status: string;
  presets: { key: string; label: string; isDefault: boolean }[];
}

export interface ActiveChallenge {
  id: string;
  type: 'DAILY' | 'WEEKLY';
  title: string;
  startsAt: string;
  endsAt: string;
  game: { slug: string; name: string; estMinutes: number };
  difficulty: string;
  mySession: { id: string; status: string; score: number | null } | null;
}

export interface RankInfo {
  rank: number;
  total: number;
  topPercent: number;
  best: number;
}

export interface StartedSession {
  sessionId: string;
  game: { slug: string; name: string; templateKey: string };
  difficulty: { key: string; label: string };
  challenge: { id: string; title: string; type: string } | null;
  attemptsLeft: number;
  level: unknown;
}

export interface SessionResult {
  sessionId: string;
  status: 'COMPLETED' | 'FLAGGED';
  score: number;
  maxScore: number;
  breakdown: Record<string, number>;
  highlights: { label: string; value: string }[];
  notes: string[];
  durationMs: number;
  fraudFlags: string[];
  leaderboard: RankInfo | null;
  challengeLeaderboard: RankInfo | null;
  isPersonalBest: boolean;
}

export interface LeaderboardResponse {
  game?: { slug: string; name: string };
  period?: string;
  entries: { rank: number; score: number; name: string; avatarUrl: string | null; isMe: boolean }[];
  me: RankInfo | null;
}
