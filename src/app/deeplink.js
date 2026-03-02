export function parseOptimizerParams(search, { schema = [], eligibleCardIdSet = null } = {}) {
  const params = new URLSearchParams(search || "");
  const spend = {};

  schema.forEach((category) => {
    const raw = params.get(`spend_${category}`);
    if (raw == null) return;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) spend[category] = value;
  });

  const lockedCardIds = (params.get("cards") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => !eligibleCardIdSet || eligibleCardIdSet.has(id));

  const kRaw = Number(params.get("k"));
  const k = Number.isFinite(kRaw) ? Math.max(0, Math.round(kRaw)) : null;

  return {
    autorun: params.get("autorun") === "1",
    valuationMode: params.get("valuationMode") === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated",
    spend,
    lockedCardIds,
    k
  };
}

export function buildOptimizerUrl(payload = {}) {
  const params = new URLSearchParams();
  params.set("source", "quick-setup");
  params.set("autorun", "1");

  if (payload.valuationMode === "minimum_guaranteed") params.set("valuationMode", "minimum_guaranteed");

  const k = Number(payload.k);
  if (Number.isFinite(k) && k >= 0) params.set("k", String(Math.round(k)));

  if (Array.isArray(payload.lockedCardIds) && payload.lockedCardIds.length) {
    params.set("cards", payload.lockedCardIds.join(","));
  }

  const spend = payload.spend || {};
  Object.entries(spend).forEach(([category, value]) => {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) params.set(`spend_${category}`, String(Math.round(amount)));
  });

  return `./index.html?${params.toString()}`;
}
