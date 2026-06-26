import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(name: string) {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
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

import {
  generateBettingRecommendations,
  getLastTotalsEdgeTrace,
} from "../lib/analysis";

async function main() {
  const sample = [
    {
      gamePk: 824743,
      away: "Test Away",
      home: "Test Home",
      status: "Scheduled",
      startTime: "7:05 PM ET",
      awayMoneyline: 120,
      homeMoneyline: -140,
      awayRunLinePoint: 1.5,
      awayRunLinePrice: -110,
      homeRunLinePoint: -1.5,
      homeRunLinePrice: -110,
      totalPoint: 9,
      overPrice: -104,
      underPrice: -116,
    },
  ];

  await generateBettingRecommendations(sample);
  console.log(JSON.stringify(getLastTotalsEdgeTrace(), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
