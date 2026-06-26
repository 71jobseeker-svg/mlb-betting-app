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
import { refreshLockedTotalBestBet } from "../lib/lock-picks";
import { bestBetsKey } from "../lib/persistence/keys";
import { loadLockedBestBets } from "../lib/persistence/store";

async function main() {
  const slateDate = getTodayInPacific();
  const redisKey = bestBetsKey(slateDate);

  console.log("Slate date (PT):", slateDate);
  console.log("Redis key (array of 3 best bets):", redisKey);
  console.log(
    "There is no separate O/U key — the total is betCategory \"total\" inside that array.\n"
  );

  const before = await loadLockedBestBets(slateDate);
  const oldTotal = before?.find((b) => b.betCategory === "total");
  const fav = before?.find((b) => b.betCategory === "favorite");
  const dog = before?.find((b) => b.betCategory === "underdog");

  if (oldTotal) {
    console.log(
      "Current O/U lock:",
      oldTotal.betLabel,
      oldTotal.betOdds,
      `edge ${oldTotal.totalsStatEdge}/10`,
      `score ${oldTotal.statScore}`
    );
  } else {
    console.log("No existing O/U lock in Redis.");
  }

  if (fav) console.log("Keeping favorite:", fav.betLabel, `(gamePk ${fav.gamePk})`);
  if (dog) console.log("Keeping underdog:", dog.betLabel, `(gamePk ${dog.gamePk})`);

  console.log("\nFetching slate + fresh totals analysis...");
  const { games } = await getTodaysGamesForBestBetRefresh();

  console.log("Regenerating O/U best bet only...\n");
  const refreshed = await refreshLockedTotalBestBet(slateDate, games);

  if (!refreshed) {
    console.error("Refresh failed.");
    process.exit(1);
  }

  const newTotal = refreshed.find((b) => b.betCategory === "total");
  const newFav = refreshed.find((b) => b.betCategory === "favorite");
  const newDog = refreshed.find((b) => b.betCategory === "underdog");

  console.log("\nUpdated locks saved to Redis.");
  console.log(
    "New O/U:",
    newTotal?.betLabel,
    newTotal?.betOdds,
    `${newTotal?.totalsStatEdge}/10 edge`,
    `score ${newTotal?.statScore}`
  );
  console.log(
    "Favorite unchanged:",
    newFav?.betLabel === fav?.betLabel && newFav?.gamePk === fav?.gamePk
      ? "yes"
      : "NO — unexpected change",
    newFav?.betLabel
  );
  console.log(
    "Underdog unchanged:",
    newDog?.betLabel === dog?.betLabel && newDog?.gamePk === dog?.gamePk
      ? "yes"
      : "NO — unexpected change",
    newDog?.betLabel
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
