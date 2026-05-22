import "server-only";

import { Redis } from "@upstash/redis";

let client: Redis | null = null;

/**
 * Vercel KV / Upstash REST credentials for read/write.
 * Uses KV_REST_API_URL + KV_REST_API_TOKEN (set automatically when KV is linked).
 * Do not use KV_REST_API_READ_ONLY_TOKEN (writes will fail).
 * KV_URL and REDIS_URL are TCP URLs — not used by the REST client.
 */
export function getRedisRestConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL?.trim() ??
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ??
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) return null;
  return { url, token };
}

export function isRedisConfigured(): boolean {
  return getRedisRestConfig() !== null;
}

export function getRedis(): Redis | null {
  const config = getRedisRestConfig();
  if (!config) return null;

  if (!client) {
    client = new Redis({
      url: config.url,
      token: config.token,
    });
  }

  return client;
}
