function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function buildOptimizerDeepLink(state = {}) {
  const params = new URLSearchParams();
  params.set("mode", state.mode === "current_cards" ? "current_cards" : "ideal_combo");
  params.set("k", String(Math.max(0, Number(state.k) || 0)));
  params.set("autorun", "1");

  if (state.valuationMode === "minimum_guaranteed") {
    params.set("vm", "minimum_guaranteed");
  }

  const locked = Array.isArray(state.lockedCardIds) ? state.lockedCardIds.filter(Boolean) : [];
  if (locked.length) params.set("locked", locked.join(","));

  for (const [cat, value] of Object.entries(state.monthlySpend || {})) {
    const clean = asNumber(value, 0);
    if (clean > 0) params.set(`spend_${cat}`, String(clean));
  }

  for (const [key, value] of Object.entries(state.subcategorySpend || {})) {
    const clean = asNumber(value, 0);
    if (clean > 0) params.set(`sub_${key}`, String(clean));
  }

  const qs = params.toString();
  return qs ? `./index.html?${qs}` : "./index.html";
}

export function readOptimizerDeepLink(search, { schema = [], subcategoryConfigs = {}, eligibleCardIdSet = new Set() } = {}) {
  const params = new URLSearchParams(search || "");
  const mode = params.get("mode") === "current_cards" ? "current_cards" : "ideal_combo";

  const spend = {};
  schema.forEach((cat) => {
    const value = asNumber(params.get(`spend_${cat}`), 0);
    if (value > 0) spend[cat] = value;
  });

  const subcategorySpend = {};
  Object.values(subcategoryConfigs).flat().forEach((config) => {
    const value = asNumber(params.get(`sub_${config.key}`), 0);
    if (value > 0) subcategorySpend[config.key] = value;
  });

  const lockedCardIds = (params.get("locked") || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id && eligibleCardIdSet.has(id));

  const kRaw = asNumber(params.get("k"), mode === "current_cards" ? 0 : 1);
  const k = mode === "current_cards" ? 0 : kRaw;

  return {
    mode,
    k,
    autorun: params.get("autorun") === "1",
    valuationMode: params.get("vm") === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated",
    lockedCardIds,
    spend,
    subcategorySpend
  };
}
