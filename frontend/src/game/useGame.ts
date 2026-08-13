import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ALL_COMPLAINTS,
  buildChoices,
  buildRoundPlan,
  CHIEF_CLEARED,
  comboMultiplier,
  COMPLAINTS,
  DEPARTMENTS,
  DEPARTMENT_BY_ID,
  HOSTILE,
  HOSTILE_CLEARED,
  limitMsFor,
  phaseAt,
  replayRound,
  ROUND_DURATION_SEC,
  SCORE,
  seededRandom,
  speedBonus,
  type AnswerLog,
  type Complaint,
  type Department,
  type HostileType,
  type PlanEntry,
  type RoundResult,
} from '@minwon/shared';

const TICK_MS = 50;
/** 컷인 재생 시간. 이 동안 라운드 시간이 멈추고 입력이 잠긴다. */
const CUT_IN_MS: Record<CutIn, number> = { chief: 1200, exec: 1500, taekwondo: 1800 };



export type Status = 'idle' | 'playing' | 'paused' | 'over';

export type CutIn = 'chief' | 'exec' | 'taekwondo';

export interface Feedback {
  kind: 'wrong' | 'timeout';
  correctDept: string;
  /** 담당 조직(본부·실). 어느 부서 일인지가 학습의 핵심이다. */
  correctUnit?: string;
  explanation: string;
}

export interface GameSnapshot {
  status: Status;
  score: number;
  combo: number;
  multiplier: number;
  remainingMs: number;
  phase: 1 | 2 | 3;
  complaint: Complaint | null;
  choices: Department[];
  hostile: boolean;
  /** 현재 민원인 얼굴. */
  emoji: string;
  /** 대기 중인 민원인들 — 압박감을 시각화한다. */
  queue: { key: number; emoji: string; hostile: boolean }[];
  queueTotal: number;
  /** 현재 문항의 남은 시간 비율 0~1. */
  questionProgress: number;
  stunned: boolean;
  feedback: Feedback | null;
  execLeft: number;
  chiefLeft: number;
  chanceReady: boolean;
  chiefReady: boolean;
  hostileType: HostileType | null;
  /** 재생 중인 컷인. 이 동안 입력은 잠긴다. */
  cutIn: CutIn | null;
  blowingAway: boolean;
  calmProgress: number;
  result: RoundResult | null;
  lastGain: { value: number; key: number } | null;
}

interface Mutable {
  status: Status;
  plan: PlanEntry[];
  index: number;
  remainingMs: number;
  score: number;
  combo: number;
  logs: AnswerLog[];
  complaint: Complaint | null;
  choices: Department[];
  hostile: boolean;
  shownAt: number;
  limitMs: number;
  stunUntil: number;
  execLeft: number;
  chiefLeft: number;
  chanceReadyAt: number;
  calmTaps: number;
  cutIn: CutIn | null;
  cutInUntil: number;
  blowingAway: boolean;
  feedback: Feedback | null;
  /** 스턴이 끝난 뒤에 다음 문항으로 넘어가기 위한 대기 표시. */
  pendingAdvance: boolean;
  result: RoundResult | null;
  lastGain: { value: number; key: number } | null;
  pausedAt: number;
  /** 직전 틱 시각. 실제 경과 시간으로 라운드 시계를 깎기 위해 쓴다. */
  lastTick: number;
  rand: () => number;
}

function initial(): Mutable {
  return {
    status: 'idle',
    plan: [],
    index: 0,
    remainingMs: ROUND_DURATION_SEC * 1000,
    score: 0,
    combo: 0,
    logs: [],
    complaint: null,
    choices: [],
    hostile: false,
    shownAt: 0,
    limitMs: 0,
    stunUntil: 0,
    execLeft: HOSTILE.execChances,
    chiefLeft: HOSTILE.chiefChances,
    chanceReadyAt: 0,
    calmTaps: 0,
    cutIn: null,
    cutInUntil: 0,
    blowingAway: false,
    feedback: null,
    pendingAdvance: false,
    result: null,
    lastGain: null,
    pausedAt: 0,
    lastTick: 0,
    rand: seededRandom(1),
  };
}

export function useGame() {
  const m = useRef<Mutable>(initial());
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  const elapsedSec = useCallback(
    () => ROUND_DURATION_SEC - m.current.remainingMs / 1000,
    []
  );

  /** 다음 문항을 화면에 올린다. */
  const advance = useCallback(() => {
    const s = m.current;
    const entry = s.plan[s.index];
    if (!entry) {
      s.index = 0; // 계획을 다 쓰면 처음부터 재사용한다
      return advance();
    }
    const complaint = ALL_COMPLAINTS.get(entry.complaintId) ?? COMPLAINTS[0];
    const rule = phaseAt(elapsedSec());
    s.complaint = complaint;
    s.hostile = entry.hostile;
    s.choices = entry.hostile
      ? []
      : buildChoices(complaint, DEPARTMENTS, Math.min(rule.choices, DEPARTMENTS.length), s.rand);
    s.shownAt = performance.now();
    s.limitMs = entry.hostile ? HOSTILE.maxMs : limitMsFor(elapsedSec(), s.combo);
    s.calmTaps = 0;
  }, [elapsedSec]);

  const finish = useCallback(() => {
    const s = m.current;
    s.status = 'over';
    s.complaint = null;
    s.choices = [];
    s.result = replayRound(s.logs, ALL_COMPLAINTS);
    rerender();
  }, [rerender]);

  /** 현재 문항을 로그에 남기고 다음으로 넘어간다. */
  const commit = useCallback(
    (chosenDept: string | null, elapsedMs: number) => {
      const s = m.current;
      if (!s.complaint) return;

      s.logs.push({
        complaintId: s.complaint.id,
        chosenDept,
        elapsedMs: Math.round(elapsedMs),
        hostile: s.hostile,
      });

      let gain = 0;
      if (s.hostile) {
        if (chosenDept === HOSTILE_CLEARED) {
          gain = SCORE.hostileCleared;
        } else {
          gain = SCORE.hostileEscaped;
          s.combo = 0;
        }
      } else if (chosenDept === CHIEF_CLEARED) {
        // 실장님이 대신 처리한 건. 정답으로 치지 않지만 콤보는 지켜준다.
        // shared의 replayRound와 반드시 같은 규칙이어야 서버 채점과 어긋나지 않는다.
        gain = SCORE.chiefCleared;
      } else if (chosenDept === null) {
        gain = SCORE.timeout;
        s.combo = 0;
        s.feedback = {
          kind: 'timeout',
          correctDept: DEPARTMENT_BY_ID.get(s.complaint.correctDept)?.name ?? '',
          correctUnit: DEPARTMENT_BY_ID.get(s.complaint.correctDept)?.unit,
          explanation: s.complaint.explanation,
        };
        s.stunUntil = performance.now() + SCORE.stunMs;
      } else if (chosenDept === s.complaint.correctDept) {
        gain = Math.round(SCORE.base * comboMultiplier(s.combo)) + speedBonus(elapsedMs);
        s.combo += 1;
      } else {
        gain = SCORE.wrong;
        s.combo = 0;
        s.feedback = {
          kind: 'wrong',
          correctDept: DEPARTMENT_BY_ID.get(s.complaint.correctDept)?.name ?? '',
          correctUnit: DEPARTMENT_BY_ID.get(s.complaint.correctDept)?.unit,
          explanation: s.complaint.explanation,
        };
        s.stunUntil = performance.now() + SCORE.stunMs;
      }

      s.score = Math.max(0, s.score + gain);
      s.lastGain = { value: gain, key: s.logs.length };
      s.index += 1;

      // 스턴이 걸렸다면 방금 처리한 민원을 화면에 남겨둔다. 해설이 어느 민원에
      // 대한 것인지 분명해야 하고, 다음 문항의 제한시간이 스턴 동안 흘러가
      // 이중으로 손해 보는 것도 막아야 한다.
      if (performance.now() < Math.max(s.stunUntil, s.cutInUntil)) {
        s.pendingAdvance = true;
      } else {
        advance();
      }
      rerender();
    },
    [advance, rerender]
  );

  const answer = useCallback(
    (deptId: string) => {
      const s = m.current;
      if (s.status !== 'playing' || s.hostile) return;
      if (performance.now() < Math.max(s.stunUntil, s.cutInUntil)) return;
      commit(deptId, performance.now() - s.shownAt);
    },
    [commit]
  );

  /** 임원진 찬스 — 악성 민원인 전용. 폭력형이면 태권도 제압 컷인이 나간다. */
  const execChance = useCallback(() => {
    const s = m.current;
    if (s.status !== 'playing' || !s.hostile || s.cutIn) return;
    const now = performance.now();
    if (s.execLeft <= 0 || now < s.chanceReadyAt) return;

    const violent = s.complaint?.hostile === 'violent';
    s.execLeft -= 1;
    s.chanceReadyAt = now + HOSTILE.cooldownMs;
    s.cutIn = violent ? 'taekwondo' : 'exec';
    s.cutInUntil = now + CUT_IN_MS[s.cutIn];
    s.blowingAway = violent;
    commit(HOSTILE_CLEARED, now - s.shownAt);
  }, [commit]);

  /** 실장님 찬스 — 일반 민원을 대신 처리한다. 악성 민원에는 통하지 않는다. */
  const chiefChance = useCallback(() => {
    const s = m.current;
    if (s.status !== 'playing' || s.cutIn) return;
    const now = performance.now();
    if (s.chiefLeft <= 0 || now < Math.max(s.stunUntil, s.cutInUntil)) return;
    if (s.hostile) return; // 실장님도 악성 민원은 감당하지 못한다

    s.chiefLeft -= 1;
    s.cutIn = 'chief';
    s.cutInUntil = now + CUT_IN_MS.chief;
    commit(CHIEF_CLEARED, now - s.shownAt);
  }, [commit]);

  /**
   * 진정 게이지 — 찬스를 못 쓸 때의 대체 경로(PRD 4.5).
   * 이것이 없으면 찬스 소진 후 악성 민원인이 나왔을 때 게임이 멈춘다.
   */
  const calmTap = useCallback(() => {
    const s = m.current;
    if (s.status !== 'playing' || !s.hostile || s.cutIn) return;
    const now = performance.now();
    const chanceAvailable = s.execLeft > 0 && now >= s.chanceReadyAt;
    if (chanceAvailable) return; // 찬스를 쓸 수 있으면 연타는 잠긴다
    s.calmTaps += 1;
    if (s.calmTaps >= HOSTILE.calmTaps) {
      commit(HOSTILE_CLEARED, now - s.shownAt);
    } else {
      rerender();
    }
  }, [commit, rerender]);

  const start = useCallback(
    (seed = Math.floor(Math.random() * 2 ** 31)) => {
      m.current = initial();
      const s = m.current;
      s.status = 'playing';
      s.plan = buildRoundPlan(seed);
      s.rand = seededRandom(seed ^ 0x5f3759df);
      advance();
      rerender();
    },
    [advance, rerender]
  );

  const pause = useCallback(() => {
    const s = m.current;
    if (s.status !== 'playing') return;
    s.status = 'paused';
    s.pausedAt = performance.now();
    rerender();
  }, [rerender]);

  const resume = useCallback(() => {
    const s = m.current;
    if (s.status !== 'paused') return;
    const delta = performance.now() - s.pausedAt;
    s.shownAt += delta;
    s.stunUntil += delta;
    s.chanceReadyAt += delta;
    s.lastTick = performance.now();
    s.status = 'playing';
    rerender();
  }, [rerender]);

  const quit = useCallback(() => {
    if (m.current.status === 'idle' || m.current.status === 'over') return;
    finish();
  }, [finish]);

  const reset = useCallback(() => {
    m.current = initial();
    rerender();
  }, [rerender]);

  // 메인 루프 — 라운드 시간, 문항 제한시간, 스턴 해제를 한 곳에서 처리한다
  useEffect(() => {
    const timer = window.setInterval(() => {
      const s = m.current;
      if (s.status !== 'playing') return;
      const now = performance.now();

      // 틱 간격을 고정값으로 빼면 시계가 실제 시간보다 느리게 간다.
      // setInterval은 부하·백그라운드 스로틀링으로 쉽게 밀리기 때문에,
      // 실제 경과 시간을 재서 깎아야 어느 기기에서나 라운드 길이가 같다.
      const dt = s.lastTick === 0 ? TICK_MS : Math.min(now - s.lastTick, 1000);
      s.lastTick = now;

      // 컷인이 재생되는 동안에는 시간이 멈춘다. 연출 때문에 손해 보면 안 된다.
      if (now >= s.cutInUntil) {
        // 악성 민원 중에는 시간이 빠르게 닳는다
        s.remainingMs -= dt * (s.hostile ? HOSTILE.drainRate : 1);
      }

      if (s.remainingMs <= 0) {
        s.remainingMs = 0;
        finish();
        return;
      }

      // 스턴·컷인이 끝나면 화면을 정리하고 다음 민원을 올린다
      const holdUntil = Math.max(s.stunUntil, s.cutInUntil);
      if (now >= holdUntil) {
        if (s.cutIn) {
          s.cutIn = null;
          s.blowingAway = false;
        }
        if (s.pendingAdvance) {
          s.pendingAdvance = false;
          s.feedback = null;
          advance();
        } else if (s.feedback) {
          s.feedback = null;
        }
      }

      // 제한시간 초과 — 악성 민원은 자동 이탈, 일반 민원은 미처리
      if (s.complaint && !s.pendingAdvance && now >= holdUntil && now - s.shownAt >= s.limitMs) {
        commit(null, now - s.shownAt);
        return;
      }
      rerender();
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [advance, commit, finish, rerender]);

  // 키보드 입력
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = m.current;
      if (s.status !== 'playing') return;
      if (e.key === ' ') {
        e.preventDefault();
        if (s.hostile) {
          execChance();
          calmTap();
        }
        return;
      }
      if (e.key === 'Shift') {
        e.preventDefault();
        chiefChance();
        return;
      }
      const key = e.key.toUpperCase();
      const idx = HOTKEY_ORDER.indexOf(key);
      if (idx >= 0 && idx < s.choices.length) {
        e.preventDefault();
        answer(s.choices[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, calmTap, chiefChance, execChance]);

  const s = m.current;
  const now = performance.now();
  const snapshot: GameSnapshot = {
    status: s.status,
    score: s.score,
    combo: s.combo,
    multiplier: comboMultiplier(s.combo),
    remainingMs: Math.max(0, s.remainingMs),
    phase: phaseAt(elapsedSec()).phase,
    complaint: s.complaint,
    choices: s.choices,
    hostile: s.hostile,
    emoji: s.plan[Math.max(0, s.index - (s.pendingAdvance ? 1 : 0))]?.emoji ?? '🧑',
    queue: s.plan.slice(s.index, s.index + 4).map((e, i) => ({
      key: s.index + i,
      emoji: e.emoji,
      hostile: e.hostile,
    })),
    queueTotal: Math.max(0, s.plan.length - s.index),
    questionProgress: s.limitMs > 0 ? Math.max(0, 1 - (now - s.shownAt) / s.limitMs) : 0,
    stunned: now < s.stunUntil,
    feedback: s.feedback,
    execLeft: s.execLeft,
    chiefLeft: s.chiefLeft,
    chanceReady: s.execLeft > 0 && now >= s.chanceReadyAt && !s.cutIn,
    chiefReady: s.chiefLeft > 0 && !s.hostile && !s.cutIn && s.status === 'playing',
    hostileType: s.complaint?.hostile ?? null,
    cutIn: s.cutIn,
    blowingAway: s.blowingAway,
    calmProgress: s.calmTaps / HOSTILE.calmTaps,
    result: s.result,
    lastGain: s.lastGain,
  };

  return { snapshot, start, reset, pause, resume, quit, answer, execChance, chiefChance, calmTap, logs: s.logs };
}

export const HOTKEY_ORDER = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
