import type { Complaint } from '../rules.js';

/**
 * 악성 민원 대사. 이전 버전의 원본을 그대로 가져왔다.
 *
 *   normal  — 억지성·반복성 민원. 임원진 찬스로 처리한다.
 *   violent — 협박·폭력 행사. 임원진 찬스 + 태권도 제압 컷인이 나간다.
 *
 * ⚠️ e005·e007은 방화·살해 협박 표현을 담고 있다. 무대 대형 스크린에
 * 크게 뜨고 IP고객상담실 직원이 관객석에 있다는 점을 감안해, 리허설 때
 * 수위를 한 번 확인하는 것을 권한다. 톤을 낮추려면 이 파일의 text만
 * 고치면 되고 게임 로직은 건드릴 필요가 없다.
 */
export const EVIL_COMPLAINTS: Complaint[] = [
  {
    id: 'e001',
    hostile: 'normal',
    text: '야!!! 내가 10년 전에 생각한 아이디어가 왜 이미 특허 등록되어 있냐고!!! 당장 그 특허 취소하고 내 이름으로 올려놔!!! 😡',
    correctDept: '__hostile__',
    explanation: '억지성 민원은 임원진 찬스로 처리합니다.',
    difficulty: 2,
  },
  {
    id: 'e002',
    hostile: 'normal',
    text: '내 세금으로 월급 받으면서 내 전화 안 받아? 당장 청장 나오라 그래! 3시간 동안 여기서 꼼짝 안 할 줄 알아!!! 👿',
    correctDept: '__hostile__',
    explanation: '반복·장시간 점유 민원은 임원진 찬스로 처리합니다.',
    difficulty: 2,
  },
  {
    id: 'e003',
    hostile: 'normal',
    text: '특허 출원 수수료가 비싸잖아!!! 당장 국가가 전액 지원하라고 법을 바꾸던가 아니면 니네가 대신 내줘!!! 🤬',
    correctDept: '__hostile__',
    explanation: '기관 권한 밖 요구는 임원진 찬스로 처리합니다.',
    difficulty: 2,
  },
  {
    id: 'e004',
    hostile: 'normal',
    text: '내가 어젯밤 꿈에 본 우주선 설계도를 특허로 등록해 달랬더니 왜 반려해?! 니들이 내 우주선 기술을 빼돌리려는 거지!!! 👽',
    correctDept: '__hostile__',
    explanation: '근거 없는 의혹 제기는 임원진 찬스로 처리합니다.',
    difficulty: 2,
  },
  {
    id: 'e005',
    hostile: 'violent',
    text: '지금 당장 내 특허 등록 안 해주면 이 사무실 다 불지르고 너너 다 죽여버릴 거야!!! 당장 서류 가져와!!! 🤬🔥',
    correctDept: '__hostile__',
    explanation: '방화·살해 협박은 임원진이 즉시 개입합니다.',
    difficulty: 3,
  },
  {
    id: 'e006',
    hostile: 'violent',
    text: '(쾅!) 야!!! 컴퓨터 다 때려 부수기 전에 내 민원 해결해!!! 상담원 너 이 새끼 멱살 한번 잡혀볼래? 👊💥',
    correctDept: '__hostile__',
    explanation: '기물파손·폭행 위협은 임원진이 즉시 개입합니다.',
    difficulty: 3,
  },
  {
    id: 'e007',
    hostile: 'violent',
    text: '이 새끼들이 전화를 끊어? 내가 내일 휘발성 인화 물질 들고 니네 사무실 찾아간다. 목 씻고 기다려라!!! 😡☠️',
    correctDept: '__hostile__',
    explanation: '방문 협박은 임원진이 즉시 개입합니다.',
    difficulty: 3,
  },
];

export const EVIL_BY_ID = new Map(EVIL_COMPLAINTS.map((c) => [c.id, c]));
