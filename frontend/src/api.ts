import type { AnswerLog } from '@minwon/shared';
import type { Record } from './leaderboard';

/**
 * 백엔드 클라이언트.
 *
 * 행사장 네트워크는 반드시 문제를 일으킨다(PRD 9.4). 그래서 모든 호출은
 * 실패해도 게임을 멈추지 않고, 호출부가 오프라인으로 되돌아갈 수 있게
 * null을 돌려준다. 점수는 서버가 정하므로 오프라인 기록은 순위에 오르지
 * 않으며, 그 사실을 화면에 분명히 표시한다.
 */

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export interface Session {
  playerId: string;
  displayName: string;
  played: number;
  maxRounds: number;
}

export interface RoundTicket {
  roundId: string;
  seed: number;
  token: string;
}

export interface SubmitResult {
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: number | null;
  clientMismatch: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function isOnline(): Promise<boolean> {
  return (await call<{ ok: boolean }>('/api/health')) !== null;
}

export function register(input: {
  employeeNo: string;
  displayName: string;
  dept?: string;
}): Promise<Session | null> {
  return call<Session>('/api/players', {
    method: 'POST',
    body: JSON.stringify({ ...input, consent: true }),
  });
}

export function startRound(playerId: string): Promise<RoundTicket | null> {
  return call<RoundTicket>('/api/rounds', {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export function submitRound(
  ticket: RoundTicket,
  logs: readonly AnswerLog[],
  clientScore: number
): Promise<SubmitResult | null> {
  return call<SubmitResult>(`/api/rounds/${ticket.roundId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ token: ticket.token, logs, clientScore }),
  });
}

export async function fetchLeaderboard(limit = 10): Promise<Record[] | null> {
  const data = await call<{ entries: Record[] }>(`/api/leaderboard?limit=${limit}`);
  return data?.entries ?? null;
}
