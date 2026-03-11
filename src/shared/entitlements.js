import { getSession } from "./auth.js";

const CACHE_MS = 60_000;
let cacheEntry = null;

export async function getEntitlements({ forceRefresh = false } = {}) {
  if (!forceRefresh && cacheEntry && (Date.now() - cacheEntry.timestamp) < CACHE_MS) {
    return cacheEntry.value;
  }

  const session = await getSession();
  const token = session?.access_token;
  if (!token) {
    const value = {
      authenticated: false,
      userId: null,
      premium: false,
      premiumUntil: null,
      reason: "missing_bearer_token",
    };
    cacheEntry = { timestamp: Date.now(), value };
    return value;
  }

  const response = await fetch("/api/me/entitlements", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json();
  cacheEntry = { timestamp: Date.now(), value: payload };
  return payload;
}
