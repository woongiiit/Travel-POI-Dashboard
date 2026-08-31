import { fmtInt, fmtNum } from "./format";

/** 참고 환산 계수 (배출·흡수 가정) */
const TREE_ABSORB_KG = 220; // 성목 1그루 평생 흡수량
const CAR_KG_PER_KM = 0.12; // 승용차 평균 주행 배출
const HOUSEHOLD_T_PER_YEAR = 0.06; // 가구 연간 전력 탄소 (tCO₂e)
const SEOUL_JEJU_T_PER_TRIP = 0.2; // 서울↔제주 왕복 1회 (tCO₂e)
const WASTE_T_CO2_PER_TON = 0.046; // 쓰레기 1톤 매립 시 (tCO₂e)

function fmtScale(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `약 ${fmtNum(n / 1e8, 1)}억`;
  if (abs >= 1e4) return `약 ${fmtNum(n / 1e4, 1)}만`;
  if (abs >= 100) return `약 ${fmtInt(n)}`;
  if (abs >= 1) return `약 ${fmtNum(n, 1)}`;
  return `약 ${fmtNum(n, 2)}`;
}

/** tCO₂e 배출량을 일상 비유 문구로 변환 */
export function buildEmissionMetaphors(emissionT: number): string[] {
  if (!emissionT || emissionT <= 0) {
    return ["배출량 데이터가 없습니다."];
  }

  const kg = emissionT * 1000;
  const trees = kg / TREE_ABSORB_KG;
  const carKm = kg / CAR_KG_PER_KM;
  const households = emissionT / HOUSEHOLD_T_PER_YEAR;
  const seoulJejuTrips = emissionT / SEOUL_JEJU_T_PER_TRIP;
  const wasteTon = emissionT / WASTE_T_CO2_PER_TON;

  return [
    `나무 ${fmtScale(trees)}그루를 심었을 때 흡수 가치와 같아요.`,
    `승용차 1대가 ${fmtScale(carKm)}km 주행할 때 나오는 배출량과 같아요.`,
    `가구 ${fmtScale(households)}채가 1년 쓰는 전력의 탄소와 비슷해요.`,
    `서울↔제주 왕복 ${fmtScale(seoulJejuTrips)}회 분량과 같아요.`,
    `일반쓰레기 ${fmtScale(wasteTon)}톤 매립 시 발생 탄소와 비슷해요.`,
  ];
}
