export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

export function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 큰 숫자를 한국어 단위(만/억)로 축약 */
export function fmtKorUnit(n: number, digits = 1): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${fmtNum(n / 1e8, digits)}억`;
  if (abs >= 1e4) return `${fmtNum(n / 1e4, digits)}만`;
  return fmtInt(n);
}

/** tCO2e 값 축약 (천 단위 콤마, 큰 값은 만 단위) */
export function fmtEmission(t: number): string {
  if (t >= 1e4) return fmtKorUnit(t, 1);
  return fmtInt(t);
}

/** "202504" -> "'25.04" */
export function fmtYm(ym: string): string {
  const y = ym.slice(2, 4);
  const m = ym.slice(4, 6);
  return `'${y}.${m}`;
}

/** "202504" -> "2025.04" */
export function fmtYmFull(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

export function pct(part: number, total: number, digits = 1): number {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(digits));
}
