import { getSession, onAuthStateChange } from "./auth.js";

const ENTITLEMENTS_TTL_MS = 90 * 1000;

let cache = {
  value: null,
  expiresAt: 0,
};

function invalidateEntitlementsCache() {
  cache = {
    value: null,
    expiresAt: 0,
  };
}

onAuthStateChange(() => {
  invalidateEntitlementsCache();
});

export async function fetchMyEntitlements() {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) {
    return cache.value;
  }

  const session = await getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    const signedOutPayload = {
      authenticated: false,
      premium: false,
      premiumUntil: null,
      reason: "missing_token",
    };
    cache = {
      value: signedOutPayload,
      expiresAt: now + ENTITLEMENTS_TTL_MS,
    };
    return signedOutPayload;
  }

  const response = await fetch("/api/me/entitlements", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || "entitlements_fetch_failed");
  }

  cache = {
    value: payload,
    expiresAt: now + ENTITLEMENTS_TTL_MS,
  };

  return payload;
}

export { invalidateEntitlementsCache };
