# 빌드 단계 — 워크스페이스 전체를 한 번에 빌드한다
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build

# 실행 단계 — 운영 의존성과 빌드 결과만 담는다
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/backend/dist backend/dist
COPY --from=builder /app/frontend/dist frontend/dist
COPY backend/src/schema.sql backend/dist/schema.sql

# 루트로 돌리지 않는다
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/src/index.js"]
