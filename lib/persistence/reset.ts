import "server-only";

import { STORAGE_KEYS } from "@/lib/persistence/keys";
import { getRedis } from "@/lib/persistence/redis-client";
import { emptyRecordsStore } from "@/lib/persistence/records-logic";
import { emptyScoresStore } from "@/lib/persistence/scores-logic";
import {
  saveRecordsStore,
  saveScoresStore,
} from "@/lib/persistence/store";

/** Clear global W-L records, saved scores, and locked best-bet slates. */
export async function resetAllLaunchData(): Promise<{
  recordsCleared: boolean;
  scoresCleared: boolean;
  bestBetsKeysRemoved: number;
}> {
  await saveRecordsStore(emptyRecordsStore());
  await saveScoresStore(emptyScoresStore());

  let bestBetsKeysRemoved = 0;
  const redis = getRedis();
  if (redis) {
    const keys = await redis.keys(`${STORAGE_KEYS.bestBetsPrefix}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      bestBetsKeysRemoved = keys.length;
    }
  }

  return {
    recordsCleared: true,
    scoresCleared: true,
    bestBetsKeysRemoved,
  };
}
