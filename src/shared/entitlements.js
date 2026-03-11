import { getSession } from "./auth.js";

const CACHE_TTL_MS = 60_000;

let cachedEntitlements = null;
let cachedAt = 0;

export async function getEntitlements({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedEntitlements && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedEntitlements;
  }

  const session = await getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;

  const response = await fetch("/api/me/entitlements", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Entitlements request failed (${response.status})`);
  }

  const payload = await response.json();
  cachedEntitlements = payload;
  cachedAt = Date.now();
  return payload;
}
