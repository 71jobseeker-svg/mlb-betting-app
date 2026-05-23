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

  // Legacy force-reset used tomorrow — never block today's slate for that
  if (slateDate < meta.recordsPausedUntil) {
    const today = getTodayInPacific();
    if (slateDate >= today) {
      return false;
    }
    return true;
  }

  if (
    meta.pauseRecordSyncBefore8am &&
    slateDate === meta.recordsPausedUntil &&
    !isAfter8amPacific()
  ) {
    return true;
  }

  return false;
}

/** After picks post at 8am, allow W-L tracking for the rest of the day. */
export async function clearRecordsPauseAfter8am(): Promise<void> {
  if (!isAfter8amPacific()) return;

  const meta = await loadMeta();
  if (!meta?.pauseRecordSyncBefore8am) return;

  await saveMeta({
    ...meta,
    pauseRecordSyncBefore8am: false,
  });
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
