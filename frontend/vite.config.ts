import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 개발 서버는 /api 를 백엔드로 넘긴다.
 *
 * 프론트는 VITE_API_BASE 가 없으면 같은 출처로 API를 호출한다(api.ts).
 * 프록시가 없으면 그 호출이 5173 자기 자신에게 가서, 백엔드를 띄워 두고도
 * 화면은 오프라인 모드로 뜬다. 운영에서는 한 프로세스가 API와 정적 파일을
 * 함께 서빙하므로 같은 출처가 맞고, 이 프록시는 그 배치를 개발에서 흉내낸다.
 *
 * 백엔드를 다른 포트로 띄웠다면 API_TARGET 으로 덮어쓴다.
 */
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 백엔드가 없으면 프록시가 실패하고, 프론트는 그대로 오프라인으로 되돌아간다.
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
