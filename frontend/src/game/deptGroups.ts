import { DEPARTMENTS, type Department } from '@minwon/shared';

/**
 * 부서 버튼을 상위 조직(본부 · 센터 · 단)으로 묶는다.
 *
 * 묶는 기준은 데이터의 `unit` 한 필드다. `unit`은 "정보활용본부 · IP정보확산실"
 * 처럼 상위 조직과 실을 가운뎃점으로 잇고 있으므로, 앞부분만 떼면 된다.
 * 엑셀에서 조직이 바뀌어도 여기를 고칠 일은 없다.
 */

export interface DeptGroup {
  /** 상위 조직 이름. 밴드 머리에 붙는다. */
  parent: string;
  depts: Department[];
}

/** 이 수 미만인 그룹은 자기 밴드를 갖지 않고 마지막 밴드에 나란히 들어간다. */
const OWN_BAND_MIN = 3;

function parentOf(d: Department): string {
  return (d.unit ?? '').split('·')[0].trim() || '기타';
}

function groupAll(): DeptGroup[] {
  const byParent = new Map<string, Department[]>();
  // DEPARTMENTS 순서를 그대로 따라간다. 그래야 그룹 순서도 문항과 무관하게 고정된다.
  for (const d of DEPARTMENTS) {
    const parent = parentOf(d);
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(d);
  }
  return [...byParent].map(([parent, depts]) => ({ parent, depts }));
}

const ALL = groupAll();

/**
 * 자기 밴드를 갖는 그룹 — 블럭이 3개 이상인 조직.
 *
 * 그룹마다 한 줄씩 주면 버튼 행이 5행에서 7행으로 늘어 1280×720에서 넘친다.
 * 큰 그룹만 밴드를 갖고 작은 그룹은 한 줄에 몰아넣어 행 수를 유지한다.
 */
export const BAND_GROUPS: DeptGroup[] = ALL.filter((g) => g.depts.length >= OWN_BAND_MIN);

/** 마지막 한 줄에 나란히 놓이는 작은 그룹들. 넓은 것부터 둔다. */
export const INLINE_GROUPS: DeptGroup[] = ALL.filter((g) => g.depts.length < OWN_BAND_MIN).sort(
  (a, b) => b.depts.length - a.depts.length
);
