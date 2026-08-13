import pg from 'pg';
import type { LeaderboardEntry, Player, RoundRecord, Store } from './types.js';

/**
 * 운영용 저장소. schema.sql을 먼저 적용해야 한다.
 * 순위는 1인 최고 기록만 올라간다 — 여러 판을 몰아쳐도 상위를 독식할 수 없다.
 */
export class PostgresStore implements Store {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  async upsertPlayer(input: Omit<Player, 'id'>): Promise<Player> {
    const { rows } = await this.pool.query<Player>(
      `INSERT INTO players (employee_hash, display_name, dept, consented_at)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
       ON CONFLICT (employee_hash) DO UPDATE SET display_name = EXCLUDED.display_name, dept = EXCLUDED.dept
       RETURNING id, employee_hash AS "employeeHash", display_name AS "displayName", dept,
                 (extract(epoch from consented_at) * 1000)::bigint AS "consentedAt"`,
      [input.employeeHash, input.displayName, input.dept, input.consentedAt]
    );
    return rows[0];
  }

  async getPlayer(id: string) {
    const { rows } = await this.pool.query<Player>(
      `SELECT id, employee_hash AS "employeeHash", display_name AS "displayName", dept,
              (extract(epoch from consented_at) * 1000)::bigint AS "consentedAt"
       FROM players WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async createRound(r: RoundRecord) {
    await this.pool.query(
      `INSERT INTO rounds (id, player_id, seed, issued_at, status, flags, answers)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7)`,
      [r.id, r.playerId, r.seed, r.issuedAt, r.status, r.flags, JSON.stringify(r.answers)]
    );
  }

  async getRound(id: string) {
    const { rows } = await this.pool.query<RoundRecord>(
      `SELECT id, player_id AS "playerId", seed,
              (extract(epoch from issued_at) * 1000)::bigint AS "issuedAt",
              (extract(epoch from submitted_at) * 1000)::bigint AS "submittedAt",
              server_score AS "serverScore", client_score AS "clientScore",
              accuracy, max_combo AS "maxCombo", status, reason, flags, answers
       FROM rounds WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async finishRound(id: string, p: Partial<RoundRecord>) {
    await this.pool.query(
      `UPDATE rounds SET
         status = COALESCE($2, status),
         submitted_at = COALESCE(to_timestamp($3 / 1000.0), submitted_at),
         server_score = COALESCE($4, server_score),
         client_score = COALESCE($5, client_score),
         accuracy = COALESCE($6, accuracy),
         max_combo = COALESCE($7, max_combo),
         reason = COALESCE($8, reason),
         flags = COALESCE($9, flags),
         answers = COALESCE($10, answers)
       WHERE id = $1`,
      [id, p.status ?? null, p.submittedAt ?? null, p.serverScore ?? null, p.clientScore ?? null,
       p.accuracy ?? null, p.maxCombo ?? null, p.reason ?? null, p.flags ?? null,
       p.answers ? JSON.stringify(p.answers) : null]
    );
  }

  async countRounds(playerId: string) {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM rounds WHERE player_id = $1 AND status = 'scored'`, [playerId]);
    return Number(rows[0].n);
  }

  async countRecentSubmissions(playerId: string, windowMs: number, now: number) {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM rounds
       WHERE player_id = $1 AND submitted_at >= to_timestamp(($2 - $3) / 1000.0)`,
      [playerId, now, windowMs]);
    return Number(rows[0].n);
  }

  async leaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const { rows } = await this.pool.query<LeaderboardEntry>(
      `SELECT DISTINCT ON (p.id)
              p.display_name AS "displayName", p.dept,
              r.server_score AS score, r.accuracy, r.max_combo AS "maxCombo",
              (extract(epoch from r.submitted_at) * 1000)::bigint AS at
       FROM rounds r JOIN players p ON p.id = r.player_id
       WHERE r.status = 'scored'
       ORDER BY p.id, r.server_score DESC`,
      []);
    return rows.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async departmentStats() {
    const { rows } = await this.pool.query<{ complaintId: string; attempts: string; correct: string }>(
      `SELECT a->>'complaintId' AS "complaintId",
              count(*) AS attempts,
              count(*) FILTER (WHERE (a->>'correct')::boolean) AS correct
       FROM rounds r, jsonb_array_elements(r.answers) a
       WHERE r.status = 'scored'
       GROUP BY 1`);
    return rows.map((r) => ({ complaintId: r.complaintId, attempts: Number(r.attempts), correct: Number(r.correct) }));
  }

  async flagged() {
    const { rows } = await this.pool.query<RoundRecord>(
      `SELECT id, player_id AS "playerId", seed, server_score AS "serverScore",
              client_score AS "clientScore", status, reason, flags, answers,
              (extract(epoch from issued_at) * 1000)::bigint AS "issuedAt",
              (extract(epoch from submitted_at) * 1000)::bigint AS "submittedAt",
              accuracy, max_combo AS "maxCombo"
       FROM rounds
       WHERE array_length(flags, 1) > 0 OR status = 'rejected'
       ORDER BY submitted_at DESC NULLS LAST LIMIT 200`);
    return rows;
  }

  async close() {
    await this.pool.end();
  }
}
