import "server-only";

import { addDaysToDateString, getTodayInPacific } from "@/lib/date";
import {
  REDIS_WIPE_PATTERNS,
  STORAGE_KEYS,
} from "@/lib/persistence/keys";
import { getRedis, isRedisConfigured } from "@/lib/persistence/redis-client";
import { emptyRecordsStore } from "@/lib/persistence/records-logic";
import { emptyScoresStore } from "@/lib/persistence/scores-logic";
import {
  loadMeta,
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

/** Wipe every app key in Redis/KV and pause record sync until tomorrow (PT). */
export async function forceResetAllData(): Promise<{
  redisConfigured: boolean;
  keysDeleted: string[];
  recordsPausedUntil: string;
  totals: typeof ZERO_TOTALS;
}> {
  const today = getTodayInPacific();
  const recordsPausedUntil = addDaysToDateString(today, 1);

  const keysDeleted: string[] = [];
  const redis = getRedis();

  if (redis) {
    for (const pattern of REDIS_WIPE_PATTERNS) {
      const removed = await deleteKeysByPattern(redis, pattern);
      keysDeleted.push(...removed);
    }

    // Explicit legacy keys (SCAN may miss exact names without wildcard file suffix)
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
    recordsPausedUntil,
    clearedAt: new Date().toISOString(),
  };

  await saveRecordsStore(emptyRecordsStore());
  await saveScoresStore(emptyScoresStore());
  await saveMeta(meta);

  return {
    redisConfigured: isRedisConfigured(),
    keysDeleted: [...new Set(keysDeleted)],
    recordsPausedUntil,
    totals: ZERO_TOTALS,
  };
}

export function isRecordsPaused(
  slateDate: string,
  meta: AppMeta | null
): boolean {
  if (!meta?.recordsPausedUntil) return false;
  return slateDate < meta.recordsPausedUntil;
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
