/**
 * 게임 규칙 엔진 — 프론트엔드와 백엔드가 공유한다.
 *
 * 이 모듈이 공유되는 것이 서버 권위 채점(PRD 7장)의 핵심이다.
 * 클라이언트는 화면을 그리기 위해, 서버는 제출된 입력 로그를 재생해
 * 점수를 다시 계산하기 위해 같은 함수를 쓴다. 두 곳의 규칙이 갈라지면
 * 정상 플레이가 부정으로 판정되므로 규칙은 반드시 여기 한 곳에만 둔다.
 */

// ---------------------------------------------------------------- 타입

export interface Department {
  id: string;
  /** 사업·서비스 정식 명칭. 오답 해설에 쓴다. */
  name: string;
  /** 버튼에 크게 표시할 짧은 이름. */
  short: string;
  /** 담당 조직 전체 이름(본부 · 실). 오답 해설에 쓴다. */
  unit?: string;
  /** 버튼 배지용 실 단위 이름. 본부명은 여러 사업이 공유해 변별력이 없다. */
  unitShort?: string;
  /** 업무 한 줄 설명. 선택지가 적은 페이즈에서만 노출한다. */
  desc?: string;
}

export type HostileType = 'normal' | 'violent';

export interface Complaint {
  id: string;
  text: string;
  /** 악성 민원이면 담당 부서가 없다. 찬스로만 처리된다. */
  hostile?: HostileType;
  correctDept: string;
  /** 헷갈리기 쉬운 부서. 지정하면 오답 선택지로 우선 출제된다. */
  distractors?: string[];
  explanation: string;
  difficulty: 1 | 2 | 3;
  source?: string;
}

/** 한 문항에 대한 플레이어의 입력. 서버 채점의 입력값이 된다. */
export interface AnswerLog {
  complaintId: string;
  /** 선택한 부서 ID. 시간 초과로 놓쳤으면 null. */
  chosenDept: string | null;
  /** 문항이 표시된 시점부터 입력까지의 경과 시간(ms). */
  elapsedMs: number;
  /** 악성 민원 문항이었는지. */
  hostile: boolean;
  /** 찬스로 해결했다면 어느 찬스인지. */
  resolvedBy?: 'chief' | 'exec';
}

export type Phase = 1 | 2 | 3;

export interface PhaseRule {
  phase: Phase;
  /** 이 페이즈가 시작되는 시각(초). */
  startSec: number;
  /** 문항당 제한시간(ms). */
  limitMs: number;
  /** 악성 민원인 등장 확률. */
  hostileRate: number;
}

// ---------------------------------------------------------------- 설정

export const ROUND_DURATION_SEC = 77;

/** 문항당 제한시간. 페이즈와 콤보에 관계없이 항상 이 값이다. */
export const QUESTION_LIMIT_MS = 7000;

/**
 * 페이즈 경계는 라운드 길이의 1/3 지점으로 잡는다.
 * 초 단위로 박아두면 라운드 길이를 바꿀 때마다 난이도 곡선이 어긋난다.
 *
 * 제한시간은 세 페이즈가 모두 같다. 부서 버튼도 항상 전부 띄우므로,
 * 페이즈가 만드는 차이는 악성 민원 등장 확률과 출제 난이도뿐이다.
 */
export const PHASES: PhaseRule[] = [
  { phase: 1, startSec: 0, limitMs: QUESTION_LIMIT_MS, hostileRate: 0 },
  { phase: 2, startSec: ROUND_DURATION_SEC / 3, limitMs: QUESTION_LIMIT_MS, hostileRate: 0.06 },
  { phase: 3, startSec: (ROUND_DURATION_SEC * 2) / 3, limitMs: QUESTION_LIMIT_MS, hostileRate: 0.12 },
];

/**
 * 한 판에서 소비될 문항 수의 어림값. 평균 응답 3초를 가정한다.
 * 출제 계획의 난이도·악성 배분을 이 값 기준으로 나눈다.
 */
export const EXPECTED_QUESTIONS = Math.round(ROUND_DURATION_SEC / 3);

export const SCORE = {
  base: 100,
  /** 오답에는 감점이 없다. 스턴으로 이미 시간을 잃기 때문(PRD 4.2). */
  wrong: 0,
  timeout: -50,
  /** 임원진 찬스로 악성 민원을 퇴치했을 때. 폭력형이 더 위험하므로 더 준다. */
  hostileCleared: 200,
  hostileClearedViolent: 300,
  hostileEscaped: -100,
  /** 실장님 찬스로 일반 민원을 대신 처리했을 때. 콤보는 늘지 않는다. */
  chiefCleared: 150,
  /** 오답 시 조작 불가 시간. */
  stunMs: 700,
  /** 속도 보너스가 0이 되는 응답 시간. */
  speedCutoffMs: 3000,
  speedMax: 60,
} as const;

export const COMBO_TIERS: ReadonlyArray<{ min: number; multiplier: number }> = [
  { min: 30, multiplier: 2.5 },
  { min: 20, multiplier: 2.0 },
  { min: 10, multiplier: 1.5 },
  { min: 5, multiplier: 1.2 },
  { min: 0, multiplier: 1.0 },
];

export const HOSTILE = {
  /** 악성 민원 중에는 시간이 이 배율로 소모된다. */
  drainRate: 1.5,
  /** 임원진 찬스 — 악성 민원 전용. */
  execChances: 2,
  /** 실장님 찬스 — 일반 민원을 대신 처리해 준다. */
  chiefChances: 1,
  cooldownMs: 12000,
  /** 찬스를 못 쓸 때의 대체 수단 — 연타 횟수. */
  calmTaps: 3,
  /** 어떤 상태에서도 이 시간이 지나면 자동 종료된다(데드락 차단). */
  maxMs: 10000,
} as const;

// ---------------------------------------------------------------- 규칙

export function phaseAt(elapsedSec: number): PhaseRule {
  let current = PHASES[0];
  for (const p of PHASES) {
    if (elapsedSec >= p.startSec) current = p;
  }
  return current;
}

export function comboMultiplier(combo: number): number {
  for (const tier of COMBO_TIERS) {
    if (combo >= tier.min) return tier.multiplier;
  }
  return 1;
}

export function speedBonus(elapsedMs: number): number {
  if (elapsedMs >= SCORE.speedCutoffMs) return 0;
  return Math.max(0, Math.round(SCORE.speedMax * (1 - elapsedMs / SCORE.speedCutoffMs)));
}

/**
 * 문항 제한시간. 지금은 모든 페이즈가 같은 값이라 상수와 다름없지만,
 * 페이즈별로 다시 갈라질 수 있으므로 호출부는 이 함수를 거친다.
 */
export function limitMsFor(elapsedSec: number): number {
  return phaseAt(elapsedSec).limitMs;
}

export interface RoundResult {
  score: number;
  correct: number;
  wrong: number;
  timeout: number;
  accuracy: number;
  maxCombo: number;
  hostileCleared: number;
  hostileEscaped: number;
  /** 오답·미처리한 문항 ID — 종료 후 학습 리뷰(PRD 5.3)에 쓴다. */
  missed: string[];
}

/**
 * 입력 로그를 재생해 라운드 결과를 계산한다.
 *
 * 순수 함수이므로 같은 로그는 클라이언트와 서버에서 항상 같은 점수를 낸다.
 * 서버는 이 결과만 순위에 사용하고, 클라이언트가 보낸 점수는 신뢰하지 않는다.
 */
export function replayRound(logs: readonly AnswerLog[], complaints: ReadonlyMap<string, Complaint>): RoundResult {
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let correct = 0;
  let wrong = 0;
  let timeout = 0;
  let hostileCleared = 0;
  let hostileEscaped = 0;
  const missed: string[] = [];

  for (const log of logs) {
    const complaint = complaints.get(log.complaintId);
    if (!complaint) continue; // 발급하지 않은 문항 — 무시한다

    if (log.hostile) {
      if (log.chosenDept === HOSTILE_CLEARED) {
        score += complaint.hostile === 'violent' ? SCORE.hostileClearedViolent : SCORE.hostileCleared;
        hostileCleared++;
        // 악성 민원 퇴치는 콤보를 리셋하지 않는다
      } else {
        score += SCORE.hostileEscaped;
        hostileEscaped++;
        combo = 0;
        missed.push(log.complaintId);
      }
      continue;
    }

    if (log.chosenDept === CHIEF_CLEARED) {
      // 실장님이 대신 처리한 건이라 정답으로 치지 않는다. 콤보는 지켜준다.
      score += SCORE.chiefCleared;
    } else if (log.chosenDept === null) {
      score += SCORE.timeout;
      timeout++;
      combo = 0;
      missed.push(log.complaintId);
    } else if (log.chosenDept === complaint.correctDept) {
      score += Math.round(SCORE.base * comboMultiplier(combo)) + speedBonus(log.elapsedMs);
      correct++;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
    } else {
      score += SCORE.wrong;
      wrong++;
      combo = 0;
      missed.push(log.complaintId);
    }
  }

  const attempted = correct + wrong + timeout;
  return {
    score: Math.max(0, score),
    correct,
    wrong,
    timeout,
    accuracy: attempted === 0 ? 0 : correct / attempted,
    maxCombo,
    hostileCleared,
    hostileEscaped,
    missed,
  };
}

/** 임원진 찬스로 악성 민원을 퇴치했을 때 chosenDept 자리에 기록하는 표식. */
export const HOSTILE_CLEARED = '__exec__';
/** 실장님 찬스로 일반 민원을 넘겼을 때의 표식. */
export const CHIEF_CLEARED = '__chief__';

// ---------------------------------------------------------------- 출제

/**
 * 문항의 선택지를 구성한다. 정답 1개 + 오답 n-1개.
 * distractors가 있으면 먼저 채워 "헷갈리는 부서"가 실제로 함께 나오게 한다.
 *
 * 지금 화면은 부서를 항상 전부 같은 자리에 띄우므로 이 함수를 쓰지 않는다.
 * 선택지를 다시 추려 내는 방식으로 돌아갈 때를 위해 남겨 둔다.
 */
export function buildChoices(
  complaint: Complaint,
  departments: readonly Department[],
  count: number,
  rand: () => number
): Department[] {
  const byId = new Map(departments.map((d) => [d.id, d]));
  const picked: Department[] = [];
  const seen = new Set<string>([complaint.correctDept]);

  for (const id of complaint.distractors ?? []) {
    if (picked.length >= count - 1) break;
    const dept = byId.get(id);
    if (dept && !seen.has(id)) {
      picked.push(dept);
      seen.add(id);
    }
  }

  const rest = departments.filter((d) => !seen.has(d.id));
  shuffle(rest, rand);
  while (picked.length < count - 1 && rest.length > 0) {
    const dept = rest.pop()!;
    picked.push(dept);
    seen.add(dept.id);
  }

  const answer = byId.get(complaint.correctDept);
  if (answer) picked.push(answer);
  shuffle(picked, rand);
  return picked;
}

/** Fisher-Yates. rand는 시드 기반이어야 서버가 같은 순서를 재현할 수 있다. */
export function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** mulberry32 — 시드 하나로 클라이언트와 서버가 동일한 난수열을 만든다. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
