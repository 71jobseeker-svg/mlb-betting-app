import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(name: string) {
  const path = join(root, name);
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value && !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

import { getTodayInPacific } from "../lib/date";
import { getTodaysGamesForBestBetRefresh } from "../lib/games";
import { refreshLockedUnderdogBestBet } from "../lib/lock-picks";
import { bestBetsKey } from "../lib/persistence/keys";
import { loadLockedBestBets } from "../lib/persistence/store";

async function main() {
  const slateDate = getTodayInPacific();
  const redisKey = bestBetsKey(slateDate);

  console.log("Slate date (PT):", slateDate);
  console.log("Redis key:", redisKey);

  const before = await loadLockedBestBets(slateDate);
  const oldUnderdog = before?.find((b) => b.betCategory === "underdog");

  if (oldUnderdog) {
    console.log(
      "Current underdog lock:",
      oldUnderdog.betLabel,
      oldUnderdog.betOdds,
      `${oldUnderdog.moneylineStatEdge}/10`,
      `score ${oldUnderdog.statScore}`
    );
  }

  const { games } = await getTodaysGamesForBestBetRefresh();
  const refreshed = await refreshLockedUnderdogBestBet(slateDate, games);

  if (!refreshed) {
    console.error("Refresh failed.");
    process.exit(1);
  }

  const newUnderdog = refreshed.find((b) => b.betCategory === "underdog");
  console.log(
    "New underdog:",
    newUnderdog?.betLabel,
    newUnderdog?.betOdds,
    `${newUnderdog?.moneylineStatEdge}/10`,
    `score ${newUnderdog?.statScore}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
