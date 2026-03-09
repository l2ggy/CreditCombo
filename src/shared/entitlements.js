import { getSession, onAuthStateChange } from "./auth.js";

const CACHE_TTL_MS = 90_000;
let cache = null;
let authSubscriptionStarted = false;

function clearCache() {
  cache = null;
}

async function ensureAuthCacheInvalidation() {
  if (authSubscriptionStarted) return;
  authSubscriptionStarted = true;
  await onAuthStateChange(() => {
    clearCache();
  });
}

function getCachedValue() {
  if (!cache) return null;
  if (Date.now() > cache.expiresAt) {
    clearCache();
    return null;
  }
  return cache.value;
}

export async function fetchMyEntitlements() {
  await ensureAuthCacheInvalidation();

  const cached = getCachedValue();
  if (cached) return cached;

  const session = await getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("missing_access_token");
  }

  const response = await fetch("/api/me/entitlements", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`entitlements_request_failed_${response.status}`);
  }

  const payload = await response.json();
  cache = {
    value: payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return payload;
}
