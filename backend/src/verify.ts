import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ALL_COMPLAINTS,
  buildRoundPlan,
  replayRound,
  ROUND_DURATION_SEC,
  type AnswerLog,
  type RoundResult,
} from '@minwon/shared';

/**
 * 서버 권위 채점의 검증 계층 (PRD 7장).
 *
 * 클라이언트는 "무엇을 눌렀는지"만 보고한다. 점수는 서버가 같은 규칙 엔진으로
 * 다시 계산하며, 클라이언트가 보낸 점수는 참고용으로만 저장한다.
 */

export interface RoundClaims {
  roundId: string;
  playerId: string;
  seed: number;
  issuedAt: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

export function issueToken(claims: RoundClaims, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  return `${payload}.${sign(payload, secret)}`;
}

export function readToken(token: string, secret: string): RoundClaims | null {
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;

  const expected = sign(payload, secret);
  // 길이가 다르면 timingSafeEqual이 던지므로 먼저 거른다
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RoundClaims;
  } catch {
    return null;
  }
}

/** 사번은 원문을 저장하지 않는다 (PRD 8장). */
export function hashEmployeeNo(employeeNo: string, secret: string): string {
  return createHmac('sha256', secret).update(employeeNo.trim()).digest('hex');
}

export type RejectReason =
  | 'invalid_token'
  | 'token_expired'
  | 'token_used'
  | 'sequence_mismatch'
  | 'too_many_answers'
  | 'duration_exceeded'
  | 'impossible_timing';

export interface VerifyOptions {
  claims: RoundClaims;
  logs: readonly AnswerLog[];
  /** 서버가 제출을 받은 시각. */
  receivedAt: number;
  tokenTtlMs: number;
}

export interface VerifyOutcome {
  ok: boolean;
  reason?: RejectReason;
  result?: RoundResult;
  flags: string[];
}

/** 문항 수보다 조금 여유를 둔다 — 계획은 넉넉히 발급되기 때문이다. */
const MAX_ANSWERS = 400;
/** 시계 오차와 네트워크 지연을 감안한 허용 폭. */
const TIMING_TOLERANCE_MS = 5000;

export function verifyRound(opts: VerifyOptions): VerifyOutcome {
  const { claims, logs, receivedAt, tokenTtlMs } = opts;
  const flags: string[] = [];

  if (receivedAt - claims.issuedAt > tokenTtlMs) {
    return { ok: false, reason: 'token_expired', flags };
  }
  if (logs.length > MAX_ANSWERS) {
    return { ok: false, reason: 'too_many_answers', flags };
  }

  // 발급한 계획과 문항 순서가 같아야 한다. 문항을 골라 풀거나 끼워 넣을 수 없다.
  const plan = buildRoundPlan(claims.seed);
  for (let i = 0; i < logs.length; i++) {
    if (plan[i]?.complaintId !== logs[i].complaintId) {
      return { ok: false, reason: 'sequence_mismatch', flags };
    }
  }

  // 라운드 길이를 넘겨 풀 수는 없다. 컷인 정지 시간을 감안해 여유를 둔다.
  const played = logs.reduce((sum, l) => sum + Math.max(0, l.elapsedMs), 0);
  if (played > (ROUND_DURATION_SEC + 30) * 1000) {
    return { ok: false, reason: 'duration_exceeded', flags };
  }

  // 실제로 흐른 시간보다 오래 플레이했다고 주장할 수는 없다.
  if (played > receivedAt - claims.issuedAt + TIMING_TOLERANCE_MS) {
    return { ok: false, reason: 'impossible_timing', flags };
  }

  const result = replayRound(logs, ALL_COMPLAINTS);
  flags.push(...detectAnomalies(logs, result));
  return { ok: true, result, flags };
}

/**
 * 통계적 이상 탐지 (PRD 7.3). 거부하지 않고 운영자 검토 대상으로만 표시한다.
 * 사람이 낼 수 없는 일관성은 매크로를 의심할 근거가 된다.
 */
export function detectAnomalies(logs: readonly AnswerLog[], result: RoundResult): string[] {
  const flags: string[] = [];
  const answered = logs.filter((l) => l.chosenDept !== null && !l.hostile);
  if (answered.length === 0) return flags;

  let fastStreak = 0;
  for (const log of answered) {
    fastStreak = log.elapsedMs < 150 ? fastStreak + 1 : 0;
    if (fastStreak >= 10) {
      flags.push('fast_streak');
      break;
    }
  }

  if (answered.length >= 10 && result.accuracy === 1) {
    const times = answered.map((l) => l.elapsedMs);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const sd = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length);
    if (sd < 30) flags.push('robotic_timing');
  }

  return flags;
}
