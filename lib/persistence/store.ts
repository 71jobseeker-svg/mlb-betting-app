import "server-only";

import type { BestBet } from "@/lib/best-bets";
import { STORAGE_KEYS, bestBetsKey } from "@/lib/persistence/keys";
import { getRedis, isRedisConfigured } from "@/lib/persistence/redis-client";
import { readJsonFile, writeJsonFile } from "@/lib/persistence/file-store";
import { emptyRecordsStore } from "@/lib/persistence/records-logic";
import { emptyScoresStore } from "@/lib/persistence/scores-logic";
import type { RecordsStore, ScoresStore } from "@/lib/persistence/types";

const RECORDS_FILE = "betting-records.json";
const SCORES_FILE = "betting-scores.json";

function bestBetsFileName(slateDate: string): string {
  return `best-bets-${slateDate}.json`;
}

async function redisGet<T>(key: string, fallback: T): Promise<T> {
  const redis = getRedis();
  if (!redis) return fallback;

  try {
    const value = await redis.get<T>(key);
    return value ?? fallback;
  } catch (error) {
    console.error(`Redis GET failed for ${key}:`, error);
    return fallback;
  }
}

async function redisSet<T>(key: string, value: T): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(key, value);
  } catch (error) {
    console.error(`Redis SET failed for ${key}:`, error);
  }
}

let warnedMissingRedis = false;

function warnIfVercelWithoutRedis(): void {
  if (warnedMissingRedis || !process.env.VERCEL || isRedisConfigured()) return;
  warnedMissingRedis = true;
  console.warn(
    "DiamondEdge: KV_REST_API_URL and KV_REST_API_TOKEN are missing. " +
      "Records and scores will NOT persist globally on Vercel."
  );
}

/** Shared persistence: Upstash / Vercel KV in production; local JSON files in dev. */
export function persistenceMode(): "redis" | "file" {
  warnIfVercelWithoutRedis();
  return isRedisConfigured() ? "redis" : "file";
}

export async function loadRecordsStore(): Promise<RecordsStore> {
  if (isRedisConfigured()) {
    return redisGet(STORAGE_KEYS.records, emptyRecordsStore());
  }
  return readJsonFile(RECORDS_FILE, emptyRecordsStore());
}

export async function saveRecordsStore(store: RecordsStore): Promise<void> {
  if (isRedisConfigured()) {
    await redisSet(STORAGE_KEYS.records, store);
    return;
  }
  await writeJsonFile(RECORDS_FILE, store);
}

export async function loadScoresStore(): Promise<ScoresStore> {
  if (isRedisConfigured()) {
    return redisGet(STORAGE_KEYS.scores, emptyScoresStore());
  }
  return readJsonFile(SCORES_FILE, emptyScoresStore());
}

export async function saveScoresStore(store: ScoresStore): Promise<void> {
  if (isRedisConfigured()) {
    await redisSet(STORAGE_KEYS.scores, store);
    return;
  }
  await writeJsonFile(SCORES_FILE, store);
}

export async function loadLockedBestBets(
  slateDate: string
): Promise<BestBet[] | null> {
  const key = bestBetsKey(slateDate);

  if (isRedisConfigured()) {
    const bets = await redisGet<BestBet[] | null>(key, null);
    return Array.isArray(bets) && bets.length > 0 ? bets : null;
  }

  const bets = await readJsonFile<BestBet[] | null>(
    bestBetsFileName(slateDate),
    null
  );
  return Array.isArray(bets) && bets.length > 0 ? bets : null;
}

export async function saveLockedBestBets(
  slateDate: string,
  bets: BestBet[]
): Promise<void> {
  const key = bestBetsKey(slateDate);

  if (isRedisConfigured()) {
    await redisSet(key, bets);
    return;
  }

  await writeJsonFile(bestBetsFileName(slateDate), bets);
}
