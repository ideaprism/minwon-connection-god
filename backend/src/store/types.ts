import type { RoundResult } from '@minwon/shared';

export interface Player {
  id: string;
  employeeHash: string;
  displayName: string;
  dept: string | null;
  consentedAt: number;
}

export interface RoundRecord {
  id: string;
  playerId: string;
  seed: number;
  issuedAt: number;
  submittedAt: number | null;
  serverScore: number | null;
  clientScore: number | null;
  accuracy: number | null;
  maxCombo: number | null;
  status: 'issued' | 'scored' | 'rejected';
  reason?: string;
  flags: string[];
  /** 문항별 정오답 — 부서별 정답률 집계에 쓴다. */
  answers: { complaintId: string; correct: boolean }[];
}

export interface LeaderboardEntry {
  displayName: string;
  dept: string | null;
  score: number;
  accuracy: number;
  maxCombo: number;
  at: number;
}

/**
 * 저장소 인터페이스. 메모리 구현으로 개발·테스트하고, 운영에서는 Postgres를 쓴다.
 * 라우트가 이 인터페이스만 알기 때문에 DB를 바꿔도 API는 그대로다.
 */
export interface Store {
  upsertPlayer(input: Omit<Player, 'id'>): Promise<Player>;
  getPlayer(id: string): Promise<Player | null>;
  createRound(round: RoundRecord): Promise<void>;
  getRound(id: string): Promise<RoundRecord | null>;
  finishRound(id: string, patch: Partial<RoundRecord>): Promise<void>;
  countRounds(playerId: string): Promise<number>;
  /** 최근 windowMs 안에 제출된 수 — 연속 제출 탐지에 쓴다. */
  countRecentSubmissions(playerId: string, windowMs: number, now: number): Promise<number>;
  leaderboard(limit: number): Promise<LeaderboardEntry[]>;
  departmentStats(): Promise<{ complaintId: string; attempts: number; correct: number }[]>;
  flagged(): Promise<RoundRecord[]>;
  close(): Promise<void>;
}

export type Scored = RoundResult;
