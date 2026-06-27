/**
 * Refresh only today's locked underdog best bet in Upstash (keeps O/U + favorite).
 *
 * Usage:
 *   node scripts/refresh-underdog-best-bet.mjs
 *
 * Or POST production: /api/admin/refresh-underdog-best-bet
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

const result = spawnSync(
  "npx",
  ["--yes", "tsx", join(root, "scripts", "refresh-underdog-best-bet.ts")],
  { cwd: root, env: process.env, stdio: "inherit", shell: true }
);

process.exit(result.status ?? 1);
