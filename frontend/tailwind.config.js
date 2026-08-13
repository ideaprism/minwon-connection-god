/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0F2547', deep: '#081833', panel: '#16305A' },
        warn: '#E8262B',
        success: '#16A34A',
        combo: '#F59E0B',
        arcade: { yellow: '#FFD400', purple: '#A855F7', cyan: '#22D3EE' },
        'office-blue': { DEFAULT: '#1B4F9C', 200: '#A9C4EA', 300: '#7BA5DE', 400: '#2F6BC4' },
      },
      fontFamily: {
        // 원본 아케이드 버전과 같은 구성 — 굵은 한글 디스플레이체가 정체성이다.
        title: ['Black Han Sans', 'Jua', 'sans-serif'],
        sans: ['Pretendard', 'system-ui', '-apple-system', 'Malgun Gothic', 'sans-serif'],
        // 점수·시간 같은 숫자는 폭이 일정한 라틴체가 읽기 좋다.
        english: ['Outfit', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // 두꺼운 외곽선 + 하드 섀도우가 이 게임의 기본 조형이다.
        cartoon: '4px 4px 0 0 #000',
        'cartoon-sm': '3px 3px 0 0 #000',
        'cartoon-lg': '8px 8px 0 0 #000',
        'cartoon-press': '2px 2px 0 0 #000',
      },
    },
  },
  plugins: [],
};
