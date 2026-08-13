import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { assertProductionSecrets, config } from './config.js';
import { registerRoutes } from './routes.js';
import { MemoryStore } from './store/memory.js';
import { PostgresStore } from './store/postgres.js';
import type { Store } from './store/types.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// DATABASE_URL이 있으면 Postgres, 없으면 메모리로 뜬다.
// 행사 당일 DB가 죽어도 게임은 굴러가야 하므로 기동 자체는 막지 않는다.
const store: Store = config.databaseUrl ? new PostgresStore(config.databaseUrl) : new MemoryStore();
if (!config.databaseUrl) {
  app.log.warn('DATABASE_URL이 없어 메모리 저장소로 기동합니다 — 재시작하면 기록이 사라집니다');
}
for (const problem of assertProductionSecrets()) app.log.warn(problem);

registerRoutes(app, store);

// 프론트 정적 파일이 같이 들어와 있으면 한 프로세스로 서빙한다.
// 컨테이너 하나만 띄우면 되므로 행사장 운영이 단순해진다.
// 컴파일 산출 경로에 기대지 않는다. Docker WORKDIR과 로컬 루트 실행 모두에서
// 같은 위치를 가리키고, 필요하면 WEB_ROOT로 덮어쓸 수 있다.
const webRoot = process.env.WEB_ROOT ?? join(process.cwd(), 'frontend/dist');
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot });
  // SPA는 아니지만, 알 수 없는 경로는 첫 화면으로 돌려보낸다.
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') ? reply.code(404).send({ error: 'not found' }) : reply.sendFile('index.html')
  );
  app.log.info(`정적 파일 서빙: ${webRoot}`);
}

const shutdown = async () => {
  await app.close();
  await store.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
