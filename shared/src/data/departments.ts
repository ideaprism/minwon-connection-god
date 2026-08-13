import type { Department } from '../rules.js';

/**
 * 정답 분류 — www.kipi.or.kr 주요사업 기준.
 *
 * docs/문제은행_v4.xlsx 에서 생성됩니다. 직접 고치지 마세요.
 */
export const DEPARTMENTS: Department[] = [
  { id: 'data-center', name: '데이터관리센터', short: '데이터관리',
    unit: '분석플랫폼지원단 · 데이터관리실', unitShort: '데이터관리실', desc: '데이터 품질관리(오류 판단·수정·패턴분석), IP5 등 해외…' },
  { id: 'kipris', name: '특허정보검색서비스(KIPRIS)', short: 'KIPRIS 검색',
    unit: '정보활용본부 · IP정보확산실', unitShort: 'IP정보확산실', desc: '대국민 검색서비스 KIPRIS 운영' },
  { id: 'digitization', name: '특허문서전자화센터', short: '문서 전자화',
    unit: '지능정보화센터 · 지능정보데이터실', unitShort: '지능정보데이터실', desc: '서면서류 스캐닝·전자화, 온라인 제출서류 명세서 전자화, 상…' },
  { id: 'kpa', name: '한국특허영문초록(KPA)', short: '영문초록 KPA',
    unit: '정보활용본부 · IP정보가공실', unitShort: 'IP정보가공실', desc: '한국특허공보 영문요약서 제작(등록 1979' },
  { id: 'translation', name: '특허정보 번역서비스', short: '번역서비스',
    unit: '정보활용본부 · IP정보확산실', unitShort: 'IP정보확산실', desc: '한영 기계번역 K2E-PAT(시스트란 공동개발, 맞춤형 대량…' },
  { id: 'ipic', name: 'IP정보통합센터', short: 'IP정보통합',
    unit: '정보시스템본부 · IP시스템기반실', unitShort: 'IP시스템기반실', desc: '민간 클라우드 기반 IP정보시스템 통합 운영(2026' },
  { id: 'kipris-plus', name: '특허정보활용서비스(KIPRISPlus)', short: 'KIPRISPlus',
    unit: '정보활용본부 · IP정보확산실', unitShort: 'IP정보확산실', desc: 'IP정보 개방·유통 플랫폼' },
  { id: 'patinex', name: '국제특허정보박람회(PATINEX)', short: 'PATINEX',
    unit: '정보활용본부 · IP정보확산실', unitShort: 'IP정보확산실', desc: '2005년부터 개최' },
  { id: 'rnd', name: '지식재산 정보화 R&D', short: '정보화 R&D',
    unit: '지능정보화센터 · 지능정보전략실', unitShort: '지능정보전략실', desc: '지능정보 지식베이스(특허기술용어사전, 조성/물성, 기계번역…' },
  { id: 'kiponet', name: '특허넷시스템 운영', short: '특허넷 운영',
    unit: '정보시스템본부 · IP시스템기반실', unitShort: 'IP시스템기반실', desc: '특허넷(KIPOnet) 응용·기반시스템 24시간 365일 운영' },
  { id: 'customer', name: '특허고객 상담서비스', short: '고객상담',
    unit: '정보활용본부 · IP고객상담실', unitShort: 'IP고객상담실', desc: '특허고객상담센터(1544-8080) 운영' },
  { id: 'global', name: '지식재산 정보화 국제협력', short: '국제협력',
    unit: '정보활용본부 · IP정보확산실', unitShort: 'IP정보확산실', desc: '대상국 IP 정보화 컨설팅(현황조사·목표모델·경제적 효과)…' },
  { id: 'tech-transfer', name: '지식재산 기술지원', short: '기술지원',
    unit: '지능정보화센터 · 지능정보전략실', unitShort: '지능정보전략실', desc: '보유 기술·지식재산권·연구논문·학습데이터의 기술이전(공고→신…' },
];

export const DEPARTMENT_BY_ID = new Map(DEPARTMENTS.map((d) => [d.id, d]));

/** 키보드 단축키 — 페이즈 3의 12개 버튼까지 커버한다. */
export const HOTKEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
