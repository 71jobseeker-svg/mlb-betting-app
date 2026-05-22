/**
 * Resets global W-L records (and optional scores / locked best bets) in Vercel KV.
 *
 * Usage:
 *   node scripts/reset-launch-data.mjs
 *   node scripts/reset-launch-data.mjs --scores --best-bets
 *
 * Requires KV_REST_API_URL and KV_REST_API_TOKEN in .env.local
 * (run `vercel env pull .env.local` if needed).
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Redis } from "@upstash/redis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const RECORDS_KEY = "diamondedge-records-v1";
const SCORES_KEY = "diamondedge-scores-v1";
const BEST_BETS_PREFIX = "diamondedge-best-bets-v1-";

function loadEnvFile(name) {
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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error(
    "Missing KV_REST_API_URL / KV_REST_API_TOKEN. Run: vercel env pull .env.local"
  );
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const resetScores = args.has("--scores") || args.has("--all");
const resetBestBets = args.has("--best-bets") || args.has("--all");

const redis = new Redis({ url, token });

async function main() {
  await redis.set(RECORDS_KEY, { days: {} });
  console.log("✓ Reset records → Best Bets & AI Picks will show 0–0");

  if (resetScores) {
    await redis.set(SCORES_KEY, {});
    console.log("✓ Cleared saved scores");
  }

  if (resetBestBets) {
    const keys = await redis.keys(`${BEST_BETS_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`✓ Removed ${keys.length} locked best-bet slate(s)`);
    } else {
      console.log("✓ No locked best-bet slates to remove");
    }
  }

  if (!resetScores && !resetBestBets) {
    console.log("  Tip: use --all to also clear test scores and locked best bets");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
