-- 민원 연결의 神 — 운영 스키마
-- 사번 원문은 저장하지 않는다. HMAC 해시만 남긴다 (PRD 8장).

CREATE TABLE IF NOT EXISTS players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_hash text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  dept          text,
  consented_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rounds (
  id           uuid PRIMARY KEY,
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seed         bigint NOT NULL,
  issued_at    timestamptz NOT NULL,
  submitted_at timestamptz,
  server_score integer,
  client_score integer,
  accuracy     double precision,
  max_combo    integer,
  status       text NOT NULL CHECK (status IN ('issued', 'scored', 'rejected')),
  reason       text,
  flags        text[] NOT NULL DEFAULT '{}',
  answers      jsonb NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS rounds_score_idx ON rounds (server_score DESC) WHERE status = 'scored';
CREATE INDEX IF NOT EXISTS rounds_player_idx ON rounds (player_id);
CREATE INDEX IF NOT EXISTS rounds_submitted_idx ON rounds (submitted_at DESC);

-- 행사 종료 후 30일 내 파기 (PRD 8장). 운영자가 주기적으로 실행한다.
-- DELETE FROM players WHERE created_at < now() - interval '30 days';
