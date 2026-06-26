/**
 * Refresh only today's locked O/U best bet in Upstash (keeps ML fav/dog).
 *
 * Usage:
 *   node scripts/refresh-total-best-bet.mjs
 *
 * Requires KV_REST_API_URL + KV_REST_API_TOKEN in .env.local
 * (run `npx vercel login` then `npx vercel env pull .env.local` if missing).
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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
    if (value && !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error(
    "Missing KV_REST_API_URL / KV_REST_API_TOKEN.\n" +
      "  npx vercel login\n" +
      "  npx vercel env pull .env.local\n" +
      "Or POST to production: /api/admin/refresh-total-best-bet"
  );
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["--yes", "tsx", join(root, "scripts", "refresh-total-best-bet.ts")],
  { cwd: root, env: process.env, stdio: "inherit", shell: true }
);

process.exit(result.status ?? 1);
