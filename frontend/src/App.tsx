import { useEffect, useState } from 'react';
import { ALL_COMPLAINTS, DEPARTMENT_BY_ID, HOSTILE, ROUND_DURATION_SEC } from '@minwon/shared';
import { useGame, HOTKEY_ORDER, type GameSnapshot } from './game/useGame';
import { loadRecords, saveRecord, type Record } from './leaderboard';
import * as api from './api';

export default function App() {
  const game = useGame();
  const g = game.snapshot;
  const [records, setRecords] = useState<Record[]>(() => loadRecords());
  const [online, setOnline] = useState(false);
  const [session, setSession] = useState<api.Session | null>(null);
  const [ticket, setTicket] = useState<api.RoundTicket | null>(null);
  const [submitted, setSubmitted] = useState<api.SubmitResult | null>(null);

  // 서버가 살아 있으면 전사 통합 랭킹을 쓰고, 아니면 로컬 기록으로 굴러간다.
  useEffect(() => {
    void (async () => {
      const ok = await api.isOnline();
      setOnline(ok);
      if (!ok) return;
      const board = await api.fetchLeaderboard();
      if (board) setRecords(board);
    })();
  }, []);

  const handleStart = async () => {
    setSubmitted(null);
    // 서버가 시드를 발급해야 제출을 검증할 수 있다(PRD 7.1).
    if (online && session) {
      const t = await api.startRound(session.playerId);
      if (t) {
        setTicket(t);
        game.start(t.seed);
        return;
      }
    }
    setTicket(null);
    game.start();
  };

  // 라운드가 끝나면 입력 로그를 보낸다. 점수는 서버가 다시 계산한다.
  useEffect(() => {
    if (g.status !== 'over' || !ticket || submitted) return;
    void (async () => {
      const res = await api.submitRound(ticket, game.logs, g.result?.score ?? 0);
      if (!res) return;
      setSubmitted(res);
      const board = await api.fetchLeaderboard();
      if (board) setRecords(board);
    })();
  }, [g.status, g.result, ticket, submitted, game.logs]);

  // Esc로 일시정지 — 행사장에서 가장 급할 때 찾는 키다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (g.status === 'playing') game.pause();
      else if (g.status === 'paused') game.resume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [g.status, game]);

  return (
    <div
      className={`min-h-dvh flex flex-col bg-navy-deep text-white font-sans
        ${g.hostile && g.status === 'playing' ? 'animate-red-flash' : ''}
        ${g.stunned ? 'animate-shake' : ''}`}
    >
      <Header g={g} onPause={game.pause} onQuit={game.quit} />

      <main className="flex-1 flex flex-col relative">
        {g.status === 'idle' && (
          <StartScreen
            records={records}
            online={online}
            session={session}
            onRegister={setSession}
            onStart={handleStart}
          />
        )}
        {(g.status === 'playing' || g.status === 'paused') && (
          <GameScreen
            g={g}
            onAnswer={game.answer}
            onExec={game.execChance}
            onChief={game.chiefChance}
            onCalm={game.calmTap}
          />
        )}
        {g.status === 'over' && (
          <ResultScreen
            g={g}
            submitted={submitted}
            pendingSubmit={ticket !== null && submitted === null}
            onSave={(name) => setRecords(saveRecord({
              displayName: name,
              score: g.result?.score ?? 0,
              accuracy: g.result?.accuracy ?? 0,
              maxCombo: g.result?.maxCombo ?? 0,
              at: Date.now(),
            }))}
            onRetry={handleStart}
            onHome={game.reset}
          />
        )}
        {g.status === 'paused' && <PauseOverlay onResume={game.resume} onQuit={game.quit} />}
        {g.cutIn && <CutInOverlay kind={g.cutIn} />}
        {g.stunned && g.status === 'playing' && !g.cutIn && <StunOverlay />}
      </main>

      <footer className="bg-navy border-t-4 border-black py-3 text-center text-[11px] text-white/45">
        © 2026 한국특허정보원(KIPI) 임직원 한마음 e스포츠 대회 | 민원 연결의 神 (KIPI COMPLAINT MASTER)
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- 헤더

function Header({ g, onPause, onQuit }: { g: GameSnapshot; onPause: () => void; onQuit: () => void }) {
  const live = g.status === 'playing' || g.status === 'paused';
  const ratio = g.remainingMs / (ROUND_DURATION_SEC * 1000);
  const bar = ratio > 0.5 ? 'bg-success' : ratio > 0.2 ? 'bg-arcade-yellow' : 'bg-warn';

  return (
    <header className="bg-navy border-b-4 border-black px-4 py-3 flex flex-wrap items-center gap-3">
      <h1 className="font-title text-2xl text-arcade-yellow text-stroke flex items-center gap-2">
        ⚡ 민원 연결의 神
      </h1>
      <span className="bg-warn text-white text-[10px] font-title px-2 py-1 rounded border-2 border-white">
        ARCADE EDITION
      </span>

      {live && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="chip font-title text-sm relative">
            SCORE <span className="font-english text-arcade-yellow text-lg">{g.score.toLocaleString()}</span>
            {g.lastGain && g.lastGain.value !== 0 && (
              <span
                key={g.lastGain.key}
                className={`absolute -top-1 right-2 font-english font-bold text-lg animate-float-up pointer-events-none
                  ${g.lastGain.value > 0 ? 'text-success' : 'text-warn'}`}
              >
                {g.lastGain.value > 0 ? '+' : ''}{g.lastGain.value}
              </span>
            )}
          </div>
          <div className="chip font-title text-sm relative">
            COMBO <span className="font-english text-arcade-purple text-lg">{g.combo}</span>
            <span className="text-white/40 text-xs ml-1">×{g.multiplier.toFixed(1)}</span>
            {g.multiplier > 1 && (
              <span
                key={g.multiplier}
                className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap font-title text-sm
                           text-arcade-purple text-stroke-sm animate-float-up pointer-events-none"
              >
                COMBO ×{g.multiplier.toFixed(1)}!
              </span>
            )}
          </div>
          <div className="chip flex items-center gap-2 w-48">
            <span className="text-xs">⏱</span>
            <div className="flex-1 h-3 rounded-full bg-black/60 border-2 border-black overflow-hidden">
              <div
                className={`h-full ${bar} transition-[width] duration-200`}
                style={{ width: `${Math.max(0, ratio) * 100}%` }}
                role="progressbar"
                aria-valuenow={Math.ceil(g.remainingMs / 1000)}
                aria-valuemin={0}
                aria-valuemax={ROUND_DURATION_SEC}
                aria-label="남은 시간"
              />
            </div>
            <span className="font-title text-xs w-9 text-right">{Math.ceil(g.remainingMs / 1000)}s</span>
          </div>
          <button onClick={onPause} className="btn-arcade-yellow px-3 py-2 text-xs">
            ⏸ 일시정지
          </button>
          <button onClick={onQuit} className="btn-arcade-red px-3 py-2 text-xs">
            업무종료
          </button>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------- 시작 화면

function StartScreen({
  records,
  online,
  session,
  onRegister,
  onStart,
}: {
  records: Record[];
  online: boolean;
  session: api.Session | null;
  onRegister: (s: api.Session) => void;
  onStart: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-6 p-6">
      <section className="panel p-6 w-full max-w-xl">
        <h2 className="font-title text-2xl text-arcade-yellow text-stroke-sm border-b-2 border-dashed border-white/20 pb-3 mb-4">
          🎮 게임 가이드
        </h2>
        <ol className="space-y-3 text-sm text-white/85">
          <Rule n="1" tone="text-arcade-yellow">
            <b>업무 매칭</b> — 줄 서 있는 민원인의 말을 읽고, 그 일을 처리하는 부서를 고르세요.
            제한시간 {ROUND_DURATION_SEC}초.
          </Rule>
          <Rule n="2" tone="text-arcade-cyan">
            <b>조작</b> — 마우스 클릭 또는 키보드 <b>{HOTKEY_ORDER.slice(0, 4).join(' · ')} …</b> 로 초고속 입력.
            <b> Esc</b>로 일시정지.
          </Rule>
          <Rule n="3" tone="text-warn">
            <b>오답 페널티</b> — 감점은 없지만 상담사가 <b>버퍼링</b> 상태에 빠져 잠시 멈춥니다.
            그동안 정답 부서가 화면에 뜹니다. 놓치면 감점.
          </Rule>
          <Rule n="4" tone="text-warn">
            <b>🚨 악성 민원</b> — 등장하면 시간이 빠르게 닳고 일반 매칭이 막힙니다.
            <b> 경영진 찬스</b>로 즉시 퇴치하세요.
          </Rule>
          <Rule n="5" tone="text-success">
            <b>콤보</b> — 연속 정답이 쌓일수록 점수 배수가 올라갑니다. 빠를수록 보너스.
          </Rule>
        </ol>

        {online && !session ? (
          <RegisterForm onRegister={onRegister} />
        ) : (
          <>
            <button onClick={onStart} className="btn-arcade-green mt-6 w-full py-4 text-2xl">
              ▶ 게임 시작 (START)
            </button>
            {online && session && (
              <p className="mt-3 text-center text-xs text-white/50">
                {session.displayName} 님 · 기록 {session.played}/{session.maxRounds}회
              </p>
            )}
          </>
        )}
      </section>

      <section className="panel p-6 w-full max-w-sm">
        <h3 className="font-title text-xl text-arcade-yellow text-stroke-sm mb-4">🏆 명예의 전당</h3>
        {records.length === 0 ? (
          <p className="text-white/50 text-sm text-center py-10 leading-relaxed">
            아직 등록된 기록이 없습니다.
            <br />첫 랭커에 도전하세요!
          </p>
        ) : (
          <ol className="space-y-2">
            {records.map((r, i) => (
              <li key={`${r.displayName}-${r.at}-${i}`} className="chip flex items-center gap-2 text-sm">
                <span
                  className={`w-6 h-6 shrink-0 rounded-full border-2 border-black grid place-items-center text-[11px] font-title
                    ${i === 0 ? 'bg-arcade-yellow text-black' : i === 1 ? 'bg-white/70 text-black' : i === 2 ? 'bg-amber-700' : 'bg-white/15'}`}
                >
                  {i + 1}
                </span>
                <span className="font-bold truncate">{r.displayName}</span>
                {r.dept && <span className="text-[10px] text-white/40 truncate">{r.dept}</span>}
                <span className="ml-auto font-title text-arcade-yellow">{r.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-[11px] text-white/35 leading-relaxed">
          {online
            ? '전사 통합 랭킹입니다. 점수는 서버가 다시 계산해 확정합니다.'
            : '서버에 연결되지 않아 이 브라우저 기록만 표시됩니다. 순위에는 반영되지 않습니다.'}
        </p>
      </section>
    </div>
  );
}

/** 참가 등록. 사번은 서버에서 해시로만 저장된다(PRD 8장). */
function RegisterForm({ onRegister }: { onRegister: (s: api.Session) => void }) {
  const [employeeNo, setEmployeeNo] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dept, setDept] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const s = await api.register({ employeeNo, displayName, dept });
        setBusy(false);
        if (s) onRegister(s);
        else setError('등록에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <input
          value={employeeNo}
          onChange={(e) => setEmployeeNo(e.target.value)}
          required
          placeholder="사번"
          className="px-3 py-3 rounded-xl border-4 border-black bg-navy-deep text-white
                     placeholder:text-white/30 focus:outline-none focus:border-arcade-yellow"
        />
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={12}
          placeholder="표시명 (닉네임 가능)"
          className="px-3 py-3 rounded-xl border-4 border-black bg-navy-deep text-white
                     placeholder:text-white/30 focus:outline-none focus:border-arcade-yellow"
        />
      </div>
      <input
        value={dept}
        onChange={(e) => setDept(e.target.value)}
        placeholder="부서 (선택)"
        className="w-full px-3 py-3 rounded-xl border-4 border-black bg-navy-deep text-white
                   placeholder:text-white/30 focus:outline-none focus:border-arcade-yellow"
      />
      <p className="text-[11px] text-white/45 leading-relaxed break-keep">
        사번은 중복 참가 확인에만 쓰이며 <b>해시로만 저장</b>되어 원문이 남지 않습니다.
        순위표에는 표시명과 부서만 공개되고, 기록은 <b>행사 종료 후 30일 내 파기</b>됩니다.
        등록을 누르면 이에 동의하는 것으로 봅니다.
      </p>
      {error && <p className="text-warn text-xs">{error}</p>}
      <button type="submit" disabled={busy} className="btn-arcade-green w-full py-4 text-xl">
        {busy ? '등록 중…' : '동의하고 참가 등록'}
      </button>
    </form>
  );
}

function Rule({ n, tone, children }: { n: string; tone: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className={`font-title ${tone}`}>{n}.</span>
      <span className="break-keep">{children}</span>
    </li>
  );
}

// ---------------------------------------------------------------- 게임 화면

interface GameProps {
  g: GameSnapshot;
  onAnswer: (id: string) => void;
  onExec: () => void;
  onChief: () => void;
  onCalm: () => void;
}

function GameScreen({ g, onAnswer, onExec, onChief, onCalm }: GameProps) {
  return (
    <div className="flex-1 flex flex-col lg:flex-row">
      {/* 왼쪽 — 민원 접수 데스크 */}
      <div className="flex-1 p-4 lg:p-6 lg:border-r-4 border-black flex flex-col">
        {/* 보드와 말풍선은 한 덩어리로 붙어 있어야 꼬리가 민원인을 가리킨다 */}
        <div className="my-auto w-full flex flex-col gap-4">
          <OfficeBoard g={g} />
          <SpeechBubble g={g} />
          {g.feedback && <FeedbackCard g={g} />}
        </div>
      </div>

      {/* 오른쪽 — 부서 매칭 컨트롤러 */}
      <div className="w-full lg:w-[520px] p-4 lg:p-6 flex flex-col gap-4 bg-navy/60">
        <div className="flex items-center justify-between">
          <h3 className="font-title text-lg text-arcade-yellow text-stroke-sm">부서 매칭 컨트롤러</h3>
          <span className="text-[10px] text-white/40 border border-white/20 rounded px-2 py-1">
            PHASE {g.phase}
          </span>
        </div>

        {g.hostile ? (
          <HostilePanel g={g} onExec={onExec} onCalm={onCalm} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {g.choices.map((dept, i) => (
              <button
                key={dept.id}
                onClick={() => onAnswer(dept.id)}
                disabled={g.stunned}
                className="btn-arcade bg-white text-black p-3 text-left flex flex-col gap-1"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-office-blue font-bold truncate">{dept.unitShort}</span>
                  <kbd className="bg-black text-arcade-yellow rounded px-1.5 text-[11px] font-title shrink-0">
                    {HOTKEY_ORDER[i]}
                  </kbd>
                </span>
                <span className="font-title text-sm leading-tight">{dept.short}</span>
                {/* 선택지가 많은 페이즈에서는 설명을 빼야 카드가 뭉개지지 않는다 */}
                {g.choices.length <= 8 && dept.desc && (
                  <span className="text-[10px] text-black/55 leading-tight line-clamp-2">{dept.desc}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-auto panel bg-navy-deep p-4">
          <h4 className="font-title text-xs mb-3">🚨 비상 대책반 찬스</h4>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onChief}
              disabled={!g.chiefReady}
              className="btn-arcade btn-arcade-blue rounded-xl py-3 text-xs font-title"
            >
              🤵 실장님 ×{g.chiefLeft}
              <span className="block text-[10px] font-sans opacity-70">Shift · 일반 민원</span>
            </button>
            <button
              onClick={onExec}
              disabled={!g.chanceReady || !g.hostile}
              className="btn-arcade btn-arcade-red rounded-xl py-3 text-xs font-title"
            >
              🦸 임원진 ×{g.execLeft}
              <span className="block text-[10px] font-sans opacity-70">Space · 악성 전용</span>
            </button>
          </div>
          <p className="mt-2 text-[11px] text-white/45 text-center">
            {g.hostile
              ? g.chanceReady
                ? '임원진 찬스를 쓰세요!'
                : '임원진 대기 중 — 진정 게이지를 연타하세요'
              : '실장님 찬스는 일반 민원을 대신 처리합니다'}
          </p>
        </div>
      </div>
    </div>
  );
}

/** 민원인이 줄을 서서 상담사에게 밀려오는 보드. 압박감의 원천이다. */
function OfficeBoard({ g }: { g: GameSnapshot }) {
  return (
    <div className="panel bg-navy-deep p-4 flex items-center gap-3 min-h-[132px]">
      <div className="flex items-center gap-2 flex-1 overflow-hidden no-scrollbar">
        {[...g.queue].reverse().map((q) => (
          <div
            key={q.key}
            className={`w-11 h-11 shrink-0 rounded-full border-4 grid place-items-center text-2xl
              bg-navy shadow-cartoon-sm animate-queue-in
              ${q.hostile ? 'border-warn' : 'border-black'}`}
            title={q.hostile ? '악성 대기 고객' : '대기 고객'}
          >
            {q.emoji}
          </div>
        ))}
        <span className="text-arcade-yellow font-title text-sm px-1">→→→</span>
      </div>

      {/* 현재 응대 중인 민원인 */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-20 h-20 rounded-full border-4 border-black grid place-items-center text-5xl shadow-cartoon
            ${g.blowingAway ? 'animate-kick-blow bg-warn' : ''}
            ${g.hostile ? 'bg-warn/30 border-warn animate-evil-pulse' : 'bg-white/90'}`}
        >
          {g.blowingAway ? '💥' : g.emoji}
        </div>
        <span
          className={`mt-2 text-[10px] font-title px-2 py-0.5 rounded border-2 border-black
            ${g.hostile ? 'bg-warn text-white' : 'bg-white text-black'}`}
        >
          {g.hostile ? '악성 민원' : '상담 고객'}
        </span>
      </div>

      <span className="text-arcade-yellow text-xl shrink-0">◀</span>

      {/* 담당 상담사 */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-20 h-20 rounded-full border-4 border-black grid place-items-center text-5xl shadow-cartoon
            ${g.stunned ? 'bg-warn/30' : 'bg-arcade-cyan/25'}`}
        >
          {g.stunned ? '🥴' : '👩‍💼'}
        </div>
        <span className="mt-2 text-[10px] font-title text-arcade-cyan">
          {g.stunned ? '버퍼링 중' : '담당 상담사'}
        </span>
      </div>
    </div>
  );
}

function SpeechBubble({ g }: { g: GameSnapshot }) {
  if (!g.complaint) return null;
  return (
    <div className="relative">
      <div
        className={`bubble-tail relative w-full border-4 rounded-3xl p-6 shadow-cartoon
          ${g.hostile ? 'border-warn bg-warn/15' : 'border-black bg-white'}`}
        style={{ ['--bubble-bg' as string]: g.hostile ? '#3a0d0f' : '#fff' }}
      >
        {g.hostile ? (
          <p className="font-title text-xs text-warn mb-2">🚨 경고! 악성 민원 발생 — 일반 매칭 불가</p>
        ) : (
          <DifficultyBadge level={g.complaint.difficulty} />
        )}
        <p
          className={`font-bold leading-snug break-keep min-h-[4.5rem]
            ${g.complaint.text.length > 60 ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'}
            ${g.hostile ? 'text-warn' : 'text-black'}`}
        >
          “{g.complaint.text}”
        </p>
        <div className="mt-4 h-2 rounded-full bg-black/15 border-2 border-black/30 overflow-hidden">
          <div
            className={`h-full ${g.hostile ? 'bg-warn' : 'bg-office-blue'}`}
            style={{ width: `${g.questionProgress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** 민원 난이도. 얼마나 신중히 읽어야 하는지 알려주는 신호다. */
function DifficultyBadge({ level }: { level: 1 | 2 | 3 }) {
  const spec = {
    1: { label: '쉬움', tone: 'text-success border-success/60 bg-success/10' },
    2: { label: '보통', tone: 'text-arcade-yellow border-arcade-yellow/60 bg-arcade-yellow/10' },
    3: { label: '어려움', tone: 'text-warn border-warn/60 bg-warn/10' },
  }[level];

  return (
    <p
      className={`inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded border-2 ${spec.tone}`}
      aria-label={`난이도 ${level}단계 ${spec.label}`}
    >
      <span className="font-title text-[11px]">난이도</span>
      <span className="text-[11px] tracking-tight" aria-hidden>
        {'★'.repeat(level) + '☆'.repeat(3 - level)}
      </span>
      <span className="font-title text-[11px]">{spec.label}</span>
    </p>
  );
}

function FeedbackCard({ g }: { g: GameSnapshot }) {
  const f = g.feedback!;
  return (
    <div className="panel bg-navy p-4 animate-pop-in">
      <p className="text-xs text-white/55 font-title">
        {f.kind === 'timeout' ? '놓쳤습니다' : '오답'} — 정답은
      </p>
      <p className="font-title text-lg text-success text-stroke-sm">{f.correctDept}</p>
      {f.correctUnit && <p className="text-[11px] text-arcade-cyan">{f.correctUnit}</p>}
      <p className="text-sm text-white/80 mt-1 break-keep">{f.explanation}</p>
    </div>
  );
}

function HostilePanel({
  g,
  onExec,
  onCalm,
}: {
  g: GameSnapshot;
  onExec: () => void;
  onCalm: () => void;
}) {
  return (
    <div className="panel border-warn bg-warn/10 p-6 flex flex-col items-center justify-center gap-4 flex-1">
      <p className="font-title text-lg text-warn text-stroke-sm">
        {g.hostileType === 'violent' ? '⚠ 직원 위협 발생 — 즉시 대응' : '일반 부서 연결 불가'}
      </p>
      {g.chanceReady ? (
        <button onClick={onExec} className="btn-arcade btn-arcade-red rounded-xl px-8 py-5 text-xl font-title">
          🦸 임원진 호출
        </button>
      ) : (
        <>
          <p className="text-sm text-white/70 text-center break-keep">
            찬스를 쓸 수 없습니다. 진정 게이지를 {HOSTILE.calmTaps}회 연타하세요.
          </p>
          <button onClick={onCalm} className="btn-arcade-yellow px-8 py-5 text-xl">
            진정시키기
          </button>
          <div className="w-48 h-4 rounded-full border-2 border-black bg-black/40 overflow-hidden">
            <div className="h-full bg-success transition-[width]" style={{ width: `${g.calmProgress * 100}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 오버레이

function PauseOverlay({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/80 z-50 grid place-items-center p-4">
      <div className="panel bg-navy p-8 max-w-sm w-full text-center animate-cut-in">
        <div className="text-6xl">⏸️</div>
        <h2 className="font-title text-2xl text-arcade-yellow text-stroke-sm mt-3">잠시 쉬는 시간</h2>
        <p className="text-sm text-white/65 mt-2 break-keep">
          민원 접수가 일시 중단되었습니다. 준비되면 업무를 재개하세요.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button onClick={onResume} className="btn-arcade-green py-3 text-lg">
            업무 재개 (Esc)
          </button>
          <button onClick={onQuit} className="btn-arcade-red py-3 text-lg">
            업무 종료
          </button>
        </div>
      </div>
    </div>
  );
}

function CutInOverlay({ kind }: { kind: NonNullable<GameSnapshot['cutIn']> }) {
  const spec = {
    chief: {
      bg: 'bg-arcade-yellow',
      icon: '🤵‍♂️✨',
      title: '실장님 찬스!',
      line: '이 정도 민원은 내가 해결하지!',
      score: '+150 SCORE (민원 즉시 처리)',
      scoreTone: 'text-office-blue',
    },
    exec: {
      bg: 'bg-warn',
      icon: '🦸‍♂️💥',
      title: '임원진 출격!',
      line: '악성 민원은 철저히 차단하겠네!',
      score: '+200 SCORE (악성 민원 제압)',
      scoreTone: 'text-arcade-yellow',
    },
    taekwondo: {
      bg: 'bg-orange-500',
      icon: '🥋👊💥',
      title: '태권도 제압!!',
      line: '기물파손 및 폭력행사는 용납하지 않는다! 얍!',
      score: 'CRITICAL!! +300 SCORE',
      scoreTone: 'text-arcade-yellow',
    },
  }[kind];

  return (
    <div className="absolute inset-0 bg-black/80 z-50 grid place-items-center p-4">
      <div className={`${spec.bg} border-8 border-black rounded-3xl shadow-cartoon-lg p-8 max-w-sm text-center animate-cut-in`}>
        <div className="text-7xl mb-2">{spec.icon}</div>
        <h2 className="font-title text-4xl text-white text-stroke">{spec.title}</h2>
        <p className="mt-3 bg-black text-white text-sm font-bold px-3 py-2 rounded-lg break-keep">
          “{spec.line}”
        </p>
        <p className={`mt-4 font-english font-bold ${spec.scoreTone}`}>{spec.score}</p>
      </div>
    </div>
  );
}

function StunOverlay() {
  return (
    <div className="absolute inset-0 bg-warn/25 z-40 grid place-items-center pointer-events-none">
      <div className="panel bg-white text-black px-8 py-5 text-center animate-pop-in">
        <div className="w-10 h-10 mx-auto mb-2 rounded-full border-4 border-black border-t-warn animate-stun-rotate" />
        <p className="font-title text-xl text-warn text-stroke-sm">뇌 버퍼링 중!</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 결과 화면

function ResultScreen({
  g,
  submitted,
  pendingSubmit,
  onSave,
  onRetry,
  onHome,
}: {
  g: GameSnapshot;
  submitted: api.SubmitResult | null;
  pendingSubmit: boolean;
  onSave: (name: string) => void;
  onRetry: () => void;
  onHome: () => void;
}) {
  const r = g.result;
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [showReview, setShowReview] = useState(false);
  if (!r) return null;

  // 놓친 문항을 부서별로 묶는다 — 종료 후 학습 리뷰(PRD 5.3)
  const byDept = new Map<string, string[]>();
  for (const id of r.missed) {
    const c = ALL_COMPLAINTS.get(id);
    if (!c) continue;
    const label = DEPARTMENT_BY_ID.get(c.correctDept)?.name ?? c.correctDept;
    if (!byDept.has(label)) byDept.set(label, []);
    const notes = byDept.get(label)!;
    if (!notes.includes(c.explanation)) notes.push(c.explanation);
  }

  return (
    <div className="flex-1 grid place-items-center p-6">
      <div className="panel p-8 w-full max-w-2xl text-center">
        <div className="text-6xl">🏁</div>
        <h2 className="font-title text-3xl text-arcade-yellow text-stroke mt-2">업무 종료!</h2>

        <p className="font-title text-6xl text-arcade-yellow text-stroke mt-6">
          {r.score.toLocaleString()}
        </p>

        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="정답" value={`${r.correct}건`} />
          <Stat label="정확도" value={`${Math.round(r.accuracy * 100)}%`} />
          <Stat label="최대 콤보" value={`${r.maxCombo}`} />
          <Stat label="악성 퇴치" value={`${r.hostileCleared}건`} />
        </dl>

        {pendingSubmit || submitted ? (
          <div className="mt-6">
            {submitted ? (
              <>
                <p className="font-title text-success">
                  기록이 전사 랭킹에 등록되었습니다
                  {submitted.rank ? ` — 현재 ${submitted.rank}위` : ''}
                </p>
                {/* 서버 점수와 화면 점수가 다르면 규칙이 갈라진 것이므로 숨기지 않는다 */}
                {submitted.clientMismatch && (
                  <p className="mt-1 text-[11px] text-warn">
                    화면 점수와 서버 확정 점수가 달라 서버 값({submitted.score.toLocaleString()})으로
                    등록했습니다.
                  </p>
                )}
              </>
            ) : (
              <p className="font-title text-white/60">서버에 기록 전송 중…</p>
            )}
          </div>
        ) : !saved ? (
          <form
            className="mt-6 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) return;
              onSave(trimmed);
              setSaved(true);
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={12}
              placeholder="명예의 전당에 남길 이름"
              className="flex-1 px-4 py-3 rounded-xl border-4 border-black bg-navy-deep text-white
                         placeholder:text-white/30 focus:outline-none focus:border-arcade-yellow"
            />
            <button type="submit" className="btn-arcade-yellow px-5 py-3">
              기록 등록 🏆
            </button>
          </form>
        ) : (
          <p className="mt-6 font-title text-success">기록이 등록되었습니다!</p>
        )}

        {byDept.size > 0 && (
          <div className="mt-6 text-left">
            <button
              onClick={() => setShowReview((v) => !v)}
              className="w-full panel bg-navy p-4 hover:brightness-110 text-left"
            >
              <p className="font-title text-sm">
                오늘 놓친 부서 {byDept.size}곳 {showReview ? '접기' : '보기'}
              </p>
              <p className="text-xs text-white/55 mt-1">
                여기만 알아두면 다음 판 점수가 확 오릅니다.
              </p>
            </button>
            {showReview && (
              <ul className="mt-3 space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                {[...byDept].map(([dept, notes]) => (
                  <li key={dept} className="chip block">
                    <p className="font-title text-success text-sm">{dept}</p>
                    <ul className="mt-1 text-xs text-white/75 space-y-0.5">
                      {notes.map((n) => (
                        <li key={n}>· {n}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <button onClick={onRetry} className="btn-arcade-green flex-1 py-4 text-lg">
            다시 도전
          </button>
          <button onClick={onHome} className="btn-arcade-blue px-6 py-4">
            메인으로
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="chip text-center">
      <dt className="text-[11px] text-white/50">{label}</dt>
      <dd className="font-title text-lg mt-1">{value}</dd>
    </div>
  );
}
