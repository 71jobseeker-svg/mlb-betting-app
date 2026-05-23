export const STORAGE_KEYS = {
  records: "diamondedge-records-v1",
  scores: "diamondedge-scores-v1",
  bestBetsPrefix: "diamondedge-best-bets-v1-",
  lockedPicksPrefix: "diamondedge-locked-picks-v1-",
  meta: "diamondedge-meta-v1",
  /** Legacy / alternate keys that may still exist in KV */
  legacyRecords: "betting-records",
  legacyRecordsJson: "betting-records.json",
} as const;

/** Redis SCAN patterns for force-reset */
export const REDIS_WIPE_PATTERNS = [
  "diamondedge*",
  "betting-records*",
  "betting-scores*",
] as const;

export function bestBetsKey(slateDate: string): string {
  return `${STORAGE_KEYS.bestBetsPrefix}${slateDate}`;
}

export function scoreKey(slateDate: string, gamePk: number): string {
  return `${slateDate}-${gamePk}`;
}

export function recordKey(gamePk: number): string {
  return String(gamePk);
}

export function lockedPicksKey(slateDate: string): string {
  return `${STORAGE_KEYS.lockedPicksPrefix}${slateDate}`;
}

export function bestBetRecordKey(gamePk: number, betType: string): string {
  return `${gamePk}:${betType}`;
}
