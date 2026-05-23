import "server-only";

import { getTodayInPacific, isAfter8amPacific } from "@/lib/date";
import {
  REDIS_WIPE_PATTERNS,
  STORAGE_KEYS,
} from "@/lib/persistence/keys";
import { getRedis, isRedisConfigured } from "@/lib/persistence/redis-client";
import { emptyRecordsStore } from "@/lib/persistence/records-logic";
import { emptyScoresStore } from "@/lib/persistence/scores-logic";
import {
  saveMeta,
  saveRecordsStore,
  saveScoresStore,
} from "@/lib/persistence/store";
import type { AppMeta } from "@/lib/persistence/types";

const ZERO_TOTALS = {
  bestBets: { wins: 0, losses: 0 },
  aiPicks: { wins: 0, losses: 0 },
} as const;

async function deleteKeysByPattern(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  pattern: string
): Promise<string[]> {
  const keys = await redis.keys(pattern);
  if (keys.length === 0) return [];
  await redis.del(...keys);
  return keys;
}

/** Wipe KV and pause record sync until 8:00 AM PT today (then resume same day). */
export async function forceResetAllData(): Promise<{
  redisConfigured: boolean;
  keysDeleted: string[];
  recordsPausedUntil: string;
  recordsResumeNote: string;
  totals: typeof ZERO_TOTALS;
}> {
  const today = getTodayInPacific();

  const keysDeleted: string[] = [];
  const redis = getRedis();

  if (redis) {
    for (const pattern of REDIS_WIPE_PATTERNS) {
      const removed = await deleteKeysByPattern(redis, pattern);
      keysDeleted.push(...removed);
    }

    const legacy = [
      STORAGE_KEYS.legacyRecords,
      STORAGE_KEYS.legacyRecordsJson,
      STORAGE_KEYS.records,
      STORAGE_KEYS.scores,
      STORAGE_KEYS.meta,
    ];
    await redis.del(...legacy);
    keysDeleted.push(...legacy);
  }

  const meta: AppMeta = {
    recordsPausedUntil: today,
    clearedAt: new Date().toISOString(),
    pauseRecordSyncBefore8am: true,
  };

  await saveRecordsStore(emptyRecordsStore());
  await saveScoresStore(emptyScoresStore());
  await saveMeta(meta);

  const recordsResumeNote = isAfter8amPacific()
    ? "Record tracking resumes immediately (after 8:00 AM PT)."
    : `Record tracking resumes at 8:00 AM PT on ${today}.`;

  return {
    redisConfigured: isRedisConfigured(),
    keysDeleted: [...new Set(keysDeleted)],
    recordsPausedUntil: today,
    recordsResumeNote,
    totals: ZERO_TOTALS,
  };
}

export function isRecordsPaused(
  slateDate: string,
  meta: AppMeta | null
): boolean {
  if (!meta?.recordsPausedUntil) return false;

  // Legacy resets used "tomorrow" — treat as paused for any earlier slate day
  if (slateDate < meta.recordsPausedUntil) return true;

  // Same-day reset: hold 0–0 until 8:00 AM PT, then track today's slate
  if (
    meta.pauseRecordSyncBefore8am &&
    slateDate === meta.recordsPausedUntil &&
    !isAfter8amPacific()
  ) {
    return true;
  }

  return false;
}

export { ZERO_TOTALS };

/** @deprecated Use forceResetAllData */
export async function resetAllLaunchData() {
  const result = await forceResetAllData();
  return {
    recordsCleared: true,
    scoresCleared: true,
    bestBetsKeysRemoved: result.keysDeleted.filter((k) =>
      k.startsWith(STORAGE_KEYS.bestBetsPrefix)
    ).length,
  };
}
