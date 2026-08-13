import { EXPECTED_QUESTIONS, seededRandom, type Complaint } from './rules.js';
import { COMPLAINTS, COMPLAINT_BY_ID } from './data/complaints.js';
import { EVIL_COMPLAINTS } from './data/evilComplaints.js';

/** 계획 길이. 한 판에서 쓰고도 남을 만큼만 잡는다. */
export const PLAN_LENGTH = 150;

export interface PlanEntry {
  complaintId: string;
  hostile: boolean;
  /** 민원인 얼굴. 시드에서 정하므로 서버와 클라이언트가 같은 화면을 만든다. */
  emoji: string;
}

const FACES = ['\u{1F9D1}', '\u{1F468}', '\u{1F469}', '\u{1F475}', '\u{1F474}', '\u{1F9D3}', '\u{1F471}', '\u{1F9D4}', '\u{1F477}', '\u{1F46E}'];
const HOSTILE_FACES = ['\u{1F621}', '\u{1F624}', '\u{1F47F}', '\u{1F47A}'];
const VIOLENT_FACES = ['\u{1F92C}', '\u{1F479}', '\u{1F44A}', '\u{1F4A3}'];

/** 악성 민원까지 포함한 전체 문항 맵. 서버 채점도 이 맵으로 재생한다. */
export const ALL_COMPLAINTS: ReadonlyMap<string, Complaint> = new Map([
  ...COMPLAINT_BY_ID,
  ...EVIL_COMPLAINTS.map((c) => [c.id, c] as const),
]);

/**
 * 라운드 계획을 시드 하나로 생성한다 (PRD 7.1).
 *
 * 순수 함수이므로 서버가 시드만 내려주면 클라이언트가 같은 계획을 만든다.
 * 제출된 로그의 문항 순서가 이 계획과 다르면 서버가 반려한다.
 */
export function buildRoundPlan(seed: number): PlanEntry[] {
  const rand = seededRandom(seed);
  const pools: Record<number, Complaint[]> = { 1: [], 2: [], 3: [] };
  for (const c of COMPLAINTS) pools[c.difficulty].push(c);

  const plan: PlanEntry[] = [];
  const recent: string[] = [];
  // 난이도와 악성 확률은 문항 인덱스로 정한다. 경과 시간으로 정하면
  // 플레이 속도에 따라 계획이 달라져 서버가 검증할 수 없다.
  const early = Math.round(EXPECTED_QUESTIONS / 3);
  const mid = Math.round((EXPECTED_QUESTIONS * 2) / 3);

  for (let i = 0; i < PLAN_LENGTH; i++) {
    const weights = i < early ? [1, 0, 0] : i < mid ? [0.5, 0.5, 0] : [0.15, 0.5, 0.35];
    const hostileRate = i < early ? 0 : i < mid ? 0.06 : 0.12;

    const roll = rand();
    const difficulty = roll < weights[0] ? 1 : roll < weights[0] + weights[1] ? 2 : 3;
    const pool = pools[difficulty].length > 0 ? pools[difficulty] : COMPLAINTS;

    // 최근 8문항과 겹치지 않게 몇 번 다시 뽑는다
    let picked = pool[Math.floor(rand() * pool.length)];
    for (let attempt = 0; attempt < 5 && recent.includes(picked.id); attempt++) {
      picked = pool[Math.floor(rand() * pool.length)];
    }
    recent.push(picked.id);
    if (recent.length > 8) recent.shift();

    if (rand() < hostileRate && EVIL_COMPLAINTS.length > 0) {
      const evil = EVIL_COMPLAINTS[Math.floor(rand() * EVIL_COMPLAINTS.length)];
      const faces = evil.hostile === 'violent' ? VIOLENT_FACES : HOSTILE_FACES;
      plan.push({ complaintId: evil.id, hostile: true, emoji: faces[Math.floor(rand() * faces.length)] });
    } else {
      plan.push({ complaintId: picked.id, hostile: false, emoji: FACES[Math.floor(rand() * FACES.length)] });
    }
  }
  return plan;
}
