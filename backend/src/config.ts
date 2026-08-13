/** 운영 설정. 비밀값은 반드시 환경변수로 넣는다. */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  /** 라운드 토큰 서명 및 사번 해시에 쓰는 비밀키. */
  secret: process.env.APP_SECRET ?? 'dev-only-secret-change-me',
  /** 운영자 콘솔 접근 토큰. */
  adminToken: process.env.ADMIN_TOKEN ?? '',
  /** 발급된 라운드 토큰의 유효 시간. */
  tokenTtlMs: Number(process.env.TOKEN_TTL_MS ?? 5 * 60 * 1000),
  /** 1인 최대 제출 횟수. 초과분은 기록되지만 순위에 들지 않는다. */
  maxRoundsPerPlayer: Number(process.env.MAX_ROUNDS ?? 3),
  databaseUrl: process.env.DATABASE_URL ?? '',
} as const;

export function assertProductionSecrets(): string[] {
  const problems: string[] = [];
  if (config.secret === 'dev-only-secret-change-me') problems.push('APP_SECRET이 기본값입니다');
  if (!config.adminToken) problems.push('ADMIN_TOKEN이 비어 있어 운영자 API가 잠깁니다');
  return problems;
}
