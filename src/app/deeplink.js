const GOALS = new Set(["ideal_combo", "current_cards"]);

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

  const goalRaw = params.get("goal") || "ideal_combo";
  const goal = GOALS.has(goalRaw) ? goalRaw : "ideal_combo";
  const kRaw = Number(params.get("k"));
  const k = Number.isFinite(kRaw) ? Math.max(0, Math.round(kRaw)) : null;

  return {
    source: params.get("source") || null,
    autorun: params.get("autorun") === "1",
    goal,
    country: params.get("country") || "CA",
    creditScore: params.get("creditScore") || "",
    annualIncome: params.get("annualIncome") || "",
    valuationMode: params.get("valuationMode") || "estimated",
    spend,
    lockedCardIds,
    k
  };
}

export function buildOptimizerUrl(payload = {}) {
  const params = new URLSearchParams();
  params.set("source", "quick-setup");
  params.set("autorun", "1");

  const goal = payload.goal === "current_cards" ? "current_cards" : "ideal_combo";
  params.set("goal", goal);

  if (payload.country) params.set("country", payload.country);
  if (payload.creditScore) params.set("creditScore", payload.creditScore);
  if (payload.annualIncome != null && String(payload.annualIncome).trim() !== "") {
    params.set("annualIncome", String(payload.annualIncome).trim());
  }
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
