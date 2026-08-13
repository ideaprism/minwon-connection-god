/**
 * 게임 규칙·데이터·출제의 공개 진입점.
 *
 * 프론트엔드와 백엔드가 모두 이 패키지를 통해 같은 규칙을 쓴다.
 * 규칙을 고칠 때는 반드시 여기 아래만 고쳐야 두 채점이 갈라지지 않는다.
 */
export * from './rules.js';
export * from './round.js';
export { COMPLAINTS, COMPLAINT_BY_ID } from './data/complaints.js';
export { DEPARTMENTS, DEPARTMENT_BY_ID, HOTKEYS } from './data/departments.js';
export { EVIL_COMPLAINTS, EVIL_BY_ID } from './data/evilComplaints.js';
