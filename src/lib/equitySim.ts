/*
  Deterministic equity simulation shared by the Home aggregate and the per-bot
  overview chart. A smooth synthetic ramp reads as fake; daily noise and
  drawdowns are what make a curve feel like real operation. The seed is fixed
  so charts are stable across renders and test runs.
*/

export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const seedOf = (name: string): number =>
  [...name].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7);

/*
  A random walk of `days` daily returns that ends exactly at `endValue`, having
  returned `windowReturn` over the window. Returns days + 1 points.
*/
export const walkSeries = (name: string, days: number, endValue: number, windowReturn: number, dailyVol: number): number[] => {
  const random = mulberry32(seedOf(name) + days);
  let cumulative = 0;
  const walk = Array.from({ length: days }, () => {
    cumulative += (random() - .5) * 2 * dailyVol;
    return cumulative;
  });
  const correction = days > 0 ? Math.log(1 + windowReturn) - walk[days - 1] : 0;
  const start = endValue / (1 + windowReturn);
  return [start, ...walk.map((value, index) => start * Math.exp(value + correction * ((index + 1) / days)))];
};

export const dateLabels = (endDateUtc: number, days: number): string[] =>
  Array.from({ length: days + 1 }, (_, index) => {
    const date = new Date(endDateUtc - (days - index) * 86400000);
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
  });

export const money = (value: number): string =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const signedMoney = (value: number): string =>
  `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;

export const percent = (value: number): string =>
  `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
