import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_COMPLAINTS, buildRoundPlan, ROUND_DURATION_SEC, type AnswerLog } from '@minwon/shared';
import { detectAnomalies, hashEmployeeNo, issueToken, readToken, verifyRound } from '../src/verify.js';

const SECRET = 'test-secret';
const SEED = 12345;

function claims(overrides: Partial<{ issuedAt: number }> = {}) {
  return { roundId: 'r1', playerId: 'p1', seed: SEED, issuedAt: 1_000_000, ...overrides };
}

/** 발급된 계획대로 정직하게 다 맞힌 로그를 만든다. */
function honestLogs(count: number, elapsedMs = 1200): AnswerLog[] {
  return buildRoundPlan(SEED)
    .slice(0, count)
    .map((entry) => ({
      complaintId: entry.complaintId,
      chosenDept: entry.hostile
        ? '__exec__'
        : ALL_COMPLAINTS.get(entry.complaintId)!.correctDept,
      elapsedMs,
      hostile: entry.hostile,
    }));
}

test('토큰은 서명이 맞아야만 읽힌다', () => {
  const token = issueToken(claims(), SECRET);
  assert.deepEqual(readToken(token, SECRET), claims());
  assert.equal(readToken(token, 'wrong-secret'), null);
  assert.equal(readToken('garbage', SECRET), null);
});

test('페이로드를 고치면 서명이 깨진다', () => {
  const token = issueToken(claims(), SECRET);
  const [, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...claims(), seed: 999 }), 'utf8')
    .toString('base64url');
  assert.equal(readToken(`${forged}.${mac}`, SECRET), null);
});

test('정직한 제출은 통과하고 서버가 점수를 계산한다', () => {
  const logs = honestLogs(10);
  const played = logs.reduce((s, l) => s + l.elapsedMs, 0);
  const out = verifyRound({
    claims: claims(),
    logs,
    receivedAt: 1_000_000 + played + 500,
    tokenTtlMs: 300_000,
  });
  assert.equal(out.ok, true);
  assert.ok(out.result);
  assert.ok(out.result.score > 0);
});

test('발급하지 않은 문항을 끼워 넣으면 반려된다', () => {
  const logs = honestLogs(5);
  logs[2] = { ...logs[2], complaintId: 'c999' };
  const out = verifyRound({ claims: claims(), logs, receivedAt: 1_010_000, tokenTtlMs: 300_000 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'sequence_mismatch');
});

test('문항 순서를 바꾸면 반려된다', () => {
  const logs = honestLogs(6);
  [logs[1], logs[4]] = [logs[4], logs[1]];
  const out = verifyRound({ claims: claims(), logs, receivedAt: 1_010_000, tokenTtlMs: 300_000 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'sequence_mismatch');
});

test('만료된 토큰은 반려된다', () => {
  const out = verifyRound({
    claims: claims(),
    logs: honestLogs(3),
    receivedAt: 1_000_000 + 400_000,
    tokenTtlMs: 300_000,
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'token_expired');
});

test('라운드 길이를 넘겨 풀었다고 주장하면 반려된다', () => {
  const logs = honestLogs(60, ((ROUND_DURATION_SEC + 40) * 1000) / 60);
  const out = verifyRound({
    claims: claims(),
    logs,
    receivedAt: 1_000_000 + 10_000_000,
    tokenTtlMs: 20_000_000,
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'duration_exceeded');
});

test('실제로 흐른 시간보다 오래 플레이했다고 주장하면 반려된다', () => {
  const logs = honestLogs(20, 2000); // 40초를 풀었다고 주장
  const out = verifyRound({
    claims: claims(),
    logs,
    receivedAt: 1_000_000 + 3_000, // 그런데 3초 만에 제출
    tokenTtlMs: 300_000,
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'impossible_timing');
});

test('점수 필드를 조작해도 서버 점수는 로그에서만 나온다', () => {
  // 클라이언트가 보낸 점수는 verifyRound에 들어가지도 않는다.
  // 즉 fetch로 999999점을 보내도 순위에는 이 결과만 쓰인다.
  const logs = honestLogs(8);
  const played = logs.reduce((s, l) => s + l.elapsedMs, 0);
  const out = verifyRound({
    claims: claims(), logs, receivedAt: 1_000_000 + played + 500, tokenTtlMs: 300_000,
  });
  assert.equal(out.ok, true);
  assert.ok(out.result!.score < 999_999);
});

test('사람이 낼 수 없는 반응속도는 플래그된다', () => {
  const logs: AnswerLog[] = Array.from({ length: 12 }, (_, i) => ({
    complaintId: `c${i}`, chosenDept: 'data-center', elapsedMs: 90, hostile: false,
  }));
  const flags = detectAnomalies(logs, {
    score: 0, correct: 12, wrong: 0, timeout: 0, accuracy: 1,
    maxCombo: 12, hostileCleared: 0, hostileEscaped: 0, missed: [],
  });
  assert.ok(flags.includes('fast_streak'));
  assert.ok(flags.includes('robotic_timing'));
});

test('사람다운 편차가 있으면 플래그되지 않는다', () => {
  const times = [820, 1400, 2100, 950, 1750, 1200, 3000, 640, 1850, 1100, 2400, 900];
  const logs: AnswerLog[] = times.map((t, i) => ({
    complaintId: `c${i}`, chosenDept: 'data-center', elapsedMs: t, hostile: false,
  }));
  const flags = detectAnomalies(logs, {
    score: 0, correct: 12, wrong: 0, timeout: 0, accuracy: 1,
    maxCombo: 12, hostileCleared: 0, hostileEscaped: 0, missed: [],
  });
  assert.deepEqual(flags, []);
});

test('사번은 원문이 남지 않고 같은 값은 같은 해시가 된다', () => {
  const a = hashEmployeeNo('20260001', SECRET);
  const b = hashEmployeeNo(' 20260001 ', SECRET);
  assert.equal(a, b);
  assert.ok(!a.includes('20260001'));
  assert.notEqual(a, hashEmployeeNo('20260002', SECRET));
});
