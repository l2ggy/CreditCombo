import { getSession } from "./auth.js";

const CACHE_TTL_MS = 60_000;

let cachedEntitlements = null;
let cachedAt = 0;

export async function getEntitlements({ forceRefresh = false } = {}) {
  const config = window.CREDITCOMBO_CONFIG || {};
  if (!config.ENTITLEMENTS_API_ENABLED) {
    return {
      authenticated: false,
      userId: null,
      premium: false,
      premiumUntil: null,
      reason: "api_disabled",
    };
  }

  const now = Date.now();
  if (!forceRefresh && cachedEntitlements && now - cachedAt < CACHE_TTL_MS) {
    return cachedEntitlements;
  }

  const session = await getSession();
  const token = session?.access_token;

  if (!token) {
    cachedEntitlements = {
      authenticated: false,
      userId: null,
      premium: false,
      premiumUntil: null,
      reason: "missing_token",
    };
    cachedAt = now;
    return cachedEntitlements;
  }

  const response = await fetch("/api/me/entitlements", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json();
  cachedEntitlements = payload;
  cachedAt = Date.now();
  return payload;
}
