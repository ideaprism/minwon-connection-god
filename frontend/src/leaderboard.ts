/**
 * 명예의 전당 — 지금은 브라우저 로컬 저장소를 쓴다.
 *
 * M2에서 서버 권위 채점(PRD 7장)이 붙으면 이 모듈의 구현만 API 호출로
 * 바꾸면 된다. 화면은 그대로 두기 위해 인터페이스를 먼저 고정해 둔다.
 */

export interface Record {
  /** 서버 응답과 이름을 맞춘다 — 온라인·오프라인 기록을 같은 화면에 쓴다. */
  displayName: string;
  dept?: string | null;
  score: number;
  accuracy: number;
  maxCombo: number;
  at: number;
}

const KEY = 'minwon-leaderboard';
const LIMIT = 10;

export function loadRecords(): Record[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is Record => typeof r?.displayName === 'string' && typeof r?.score === 'number'
    );
  } catch {
    return [];
  }
}

export function saveRecord(entry: Record): Record[] {
  const next = [...loadRecords(), entry].sort((a, b) => b.score - a.score).slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패해도 게임은 계속된다 */
  }
  return next;
}
