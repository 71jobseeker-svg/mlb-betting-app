export const STORAGE_KEYS = {
  records: "diamondedge-records-v1",
  scores: "diamondedge-scores-v1",
  bestBetsPrefix: "diamondedge-best-bets-v1-",
} as const;

export function bestBetsKey(slateDate: string): string {
  return `${STORAGE_KEYS.bestBetsPrefix}${slateDate}`;
}

export function scoreKey(slateDate: string, gamePk: number): string {
  return `${slateDate}-${gamePk}`;
}

export function recordKey(gamePk: number): string {
  return String(gamePk);
}
