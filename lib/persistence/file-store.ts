import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

function getDataDir(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "diamondedge-data");
  }
  return path.join(process.cwd(), "data");
}

function filePath(name: string): string {
  return path.join(getDataDir(), name);
}

function ensureDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function readJsonFile<T>(name: string, fallback: T): Promise<T> {
  try {
    ensureDir();
    const fp = filePath(name);
    if (!existsSync(fp)) return fallback;
    const raw = readFileSync(fp, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Failed to read ${name}:`, error);
    return fallback;
  }
}

export async function writeJsonFile<T>(name: string, data: T): Promise<void> {
  try {
    ensureDir();
    writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error(`Failed to write ${name}:`, error);
  }
}
