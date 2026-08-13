import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ALL_COMPLAINTS, DEPARTMENT_BY_ID, ROUND_DURATION_SEC, type AnswerLog } from '@minwon/shared';
import { config } from './config.js';
import { hashEmployeeNo, issueToken, readToken, verifyRound } from './verify.js';
import type { Store } from './store/types.js';

interface RegisterBody {
  employeeNo?: string;
  displayName?: string;
  dept?: string;
  consent?: boolean;
}

interface SubmitBody {
  token?: string;
  logs?: AnswerLog[];
  clientScore?: number;
}

export function registerRoutes(app: FastifyInstance, store: Store) {
  app.get('/api/health', async () => ({ ok: true, roundSec: ROUND_DURATION_SEC }));

  /** 참가 등록. 사번은 해시만 저장한다 (PRD 8장). */
  app.post<{ Body: RegisterBody }>('/api/players', async (req, reply) => {
    const { employeeNo, displayName, dept, consent } = req.body ?? {};
    if (!employeeNo?.trim() || !displayName?.trim()) {
      return reply.code(400).send({ error: '사번과 표시명이 필요합니다' });
    }
    if (consent !== true) {
      return reply.code(400).send({ error: '개인정보 수집·이용 동의가 필요합니다' });
    }
    const player = await store.upsertPlayer({
      employeeHash: hashEmployeeNo(employeeNo, config.secret),
      displayName: displayName.trim().slice(0, 12),
      dept: dept?.trim().slice(0, 30) || null,
      consentedAt: Date.now(),
    });
    const played = await store.countRounds(player.id);
    return { playerId: player.id, displayName: player.displayName, played, maxRounds: config.maxRoundsPerPlayer };
  });

  /** 라운드 시작 — 시드와 서명된 토큰을 발급한다. 문항 순서는 시드로 결정된다. */
  app.post<{ Body: { playerId?: string } }>('/api/rounds', async (req, reply) => {
    const playerId = req.body?.playerId;
    if (!playerId || !(await store.getPlayer(playerId))) {
      return reply.code(404).send({ error: '등록되지 않은 참가자입니다' });
    }

    const roundId = randomUUID();
    const seed = randomInt(1, 2 ** 31 - 1);
    const issuedAt = Date.now();

    await store.createRound({
      id: roundId, playerId, seed, issuedAt,
      submittedAt: null, serverScore: null, clientScore: null,
      accuracy: null, maxCombo: null, status: 'issued', flags: [], answers: [],
    });

    return {
      roundId,
      seed,
      issuedAt,
      token: issueToken({ roundId, playerId, seed, issuedAt }, config.secret),
      roundSec: ROUND_DURATION_SEC,
    };
  });

  /** 라운드 제출 — 입력 로그를 재생해 서버가 점수를 정한다. */
  app.post<{ Params: { id: string }; Body: SubmitBody }>('/api/rounds/:id/submit', async (req, reply) => {
    const { token, logs, clientScore } = req.body ?? {};
    if (!token || !Array.isArray(logs)) {
      return reply.code(400).send({ error: '토큰과 입력 로그가 필요합니다' });
    }

    const claims = readToken(token, config.secret);
    if (!claims || claims.roundId !== req.params.id) {
      return reply.code(401).send({ error: '유효하지 않은 토큰입니다', reason: 'invalid_token' });
    }

    const round = await store.getRound(claims.roundId);
    if (!round) return reply.code(404).send({ error: '라운드를 찾을 수 없습니다' });
    // 토큰은 1회용이다. 같은 로그를 다시 제출해 순위를 부풀릴 수 없다.
    if (round.status !== 'issued') {
      return reply.code(409).send({ error: '이미 제출된 라운드입니다', reason: 'token_used' });
    }

    const receivedAt = Date.now();
    const outcome = verifyRound({ claims, logs, receivedAt, tokenTtlMs: config.tokenTtlMs });

    if (!outcome.ok || !outcome.result) {
      await store.finishRound(round.id, {
        status: 'rejected', submittedAt: receivedAt, clientScore: clientScore ?? null,
        reason: outcome.reason, flags: outcome.flags,
      });
      return reply.code(422).send({ error: '제출이 검증을 통과하지 못했습니다', reason: outcome.reason });
    }

    const flags = [...outcome.flags];
    if (await store.countRecentSubmissions(claims.playerId, 60_000, receivedAt) >= 3) {
      flags.push('rapid_submissions');
    }

    const answers = logs
      .filter((l) => !l.hostile)
      .map((l) => ({
        complaintId: l.complaintId,
        correct: l.chosenDept === ALL_COMPLAINTS.get(l.complaintId)?.correctDept,
      }));

    await store.finishRound(round.id, {
      status: 'scored',
      submittedAt: receivedAt,
      serverScore: outcome.result.score,
      clientScore: clientScore ?? null,
      accuracy: outcome.result.accuracy,
      maxCombo: outcome.result.maxCombo,
      flags,
      answers,
    });

    const board = await store.leaderboard(100);
    const rank = board.findIndex((e) => e.score === outcome.result!.score) + 1;

    return {
      score: outcome.result.score,
      accuracy: outcome.result.accuracy,
      maxCombo: outcome.result.maxCombo,
      correct: outcome.result.correct,
      hostileCleared: outcome.result.hostileCleared,
      rank: rank || null,
      // 클라이언트 점수와 어긋나면 규칙이 갈라진 것이므로 개발 중 바로 드러나야 한다
      clientMismatch: clientScore !== undefined && clientScore !== outcome.result.score,
    };
  });

  app.get<{ Querystring: { limit?: string } }>('/api/leaderboard', async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 10) || 10, 100);
    return { entries: await store.leaderboard(limit) };
  });

  /** 부서별 정답률 — 행사 후 "가장 많이 틀린 부서" 자료가 된다 (PRD 1.1). */
  app.get('/api/stats/departments', async () => {
    const rows = await store.departmentStats();
    const agg = new Map<string, { attempts: number; correct: number }>();
    for (const row of rows) {
      const dept = ALL_COMPLAINTS.get(row.complaintId)?.correctDept;
      if (!dept) continue;
      const cur = agg.get(dept) ?? { attempts: 0, correct: 0 };
      cur.attempts += row.attempts;
      cur.correct += row.correct;
      agg.set(dept, cur);
    }
    return {
      departments: [...agg]
        .map(([id, v]) => ({
          id,
          name: DEPARTMENT_BY_ID.get(id)?.name ?? id,
          unit: DEPARTMENT_BY_ID.get(id)?.unit ?? null,
          attempts: v.attempts,
          correct: v.correct,
          accuracy: v.attempts ? v.correct / v.attempts : 0,
        }))
        .sort((a, b) => a.accuracy - b.accuracy),
    };
  });

  /** 운영자 콘솔 — 부정 의심 기록 검토 (PRD 6.3). */
  app.get('/api/admin/flagged', async (req, reply) => {
    if (!config.adminToken || req.headers['x-admin-token'] !== config.adminToken) {
      return reply.code(401).send({ error: '권한이 없습니다' });
    }
    return { rounds: await store.flagged() };
  });
}
