import { randomUUID } from 'node:crypto';
import type { LeaderboardEntry, Player, RoundRecord, Store } from './types.js';

/**
 * 메모리 저장소. 개발과 테스트, 그리고 DB 없이 급히 돌려야 할 때 쓴다.
 * 프로세스가 죽으면 기록이 사라지므로 행사 본 운영에는 쓰지 않는다.
 */
export class MemoryStore implements Store {
  private players = new Map<string, Player>();
  private byHash = new Map<string, string>();
  private rounds = new Map<string, RoundRecord>();

  async upsertPlayer(input: Omit<Player, 'id'>): Promise<Player> {
    const existingId = this.byHash.get(input.employeeHash);
    if (existingId) {
      const merged = { ...this.players.get(existingId)!, ...input, id: existingId };
      this.players.set(existingId, merged);
      return merged;
    }
    const player: Player = { ...input, id: randomUUID() };
    this.players.set(player.id, player);
    this.byHash.set(player.employeeHash, player.id);
    return player;
  }

  async getPlayer(id: string) {
    return this.players.get(id) ?? null;
  }

  async createRound(round: RoundRecord) {
    this.rounds.set(round.id, round);
  }

  async getRound(id: string) {
    return this.rounds.get(id) ?? null;
  }

  async finishRound(id: string, patch: Partial<RoundRecord>) {
    const current = this.rounds.get(id);
    if (current) this.rounds.set(id, { ...current, ...patch });
  }

  async countRounds(playerId: string) {
    return [...this.rounds.values()].filter((r) => r.playerId === playerId && r.status === 'scored').length;
  }

  async countRecentSubmissions(playerId: string, windowMs: number, now: number) {
    return [...this.rounds.values()].filter(
      (r) => r.playerId === playerId && r.submittedAt !== null && now - r.submittedAt <= windowMs
    ).length;
  }

  async leaderboard(limit: number): Promise<LeaderboardEntry[]> {
    // 1인 1기록(최고점)만 순위에 올린다. 여러 판을 몰아쳐도 상위를 독식할 수 없다.
    const best = new Map<string, LeaderboardEntry>();
    for (const r of this.rounds.values()) {
      if (r.status !== 'scored' || r.serverScore === null) continue;
      const player = this.players.get(r.playerId);
      if (!player) continue;
      const entry: LeaderboardEntry = {
        displayName: player.displayName,
        dept: player.dept,
        score: r.serverScore,
        accuracy: r.accuracy ?? 0,
        maxCombo: r.maxCombo ?? 0,
        at: r.submittedAt ?? 0,
      };
      const prev = best.get(r.playerId);
      if (!prev || entry.score > prev.score) best.set(r.playerId, entry);
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async departmentStats() {
    const agg = new Map<string, { attempts: number; correct: number }>();
    for (const r of this.rounds.values()) {
      if (r.status !== 'scored') continue;
      for (const a of r.answers) {
        const cur = agg.get(a.complaintId) ?? { attempts: 0, correct: 0 };
        cur.attempts += 1;
        if (a.correct) cur.correct += 1;
        agg.set(a.complaintId, cur);
      }
    }
    return [...agg].map(([complaintId, v]) => ({ complaintId, ...v }));
  }

  async flagged() {
    return [...this.rounds.values()].filter((r) => r.flags.length > 0 || r.status === 'rejected');
  }

  async close() {
    /* 정리할 자원이 없다 */
  }
}
