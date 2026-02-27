import { annualizeMonthlySpend, findBestCombo } from "./optimizer.js";

export function createOptimizerController({ cards, programsMap, schema }) {
  const eligibleCards = Array.isArray(cards) ? cards : [];
  const eligibleCardIdSet = new Set(eligibleCards.map((card) => card.id));
  const comboCache = new Map();

  function normalizeManualIds(manualCardIds = []) {
    return [...new Set(manualCardIds)].filter((id) => eligibleCardIdSet.has(id));
  }

  function filterUnlockedCards({ manualIds, excludeFeeCards, excludeBusinessCards }) {
    const selected = new Set(manualIds);
    let pool = eligibleCards.filter((card) => !selected.has(card.id));
    if (excludeFeeCards) pool = pool.filter((card) => Number(card.annual_fee?.amount ?? 0) <= 0);
    if (excludeBusinessCards) pool = pool.filter((card) => !card.is_business_card);
    return pool;
  }

  function spendKey(monthlySpend) {
    return schema.map((cat) => `${cat}:${monthlySpend?.[cat] || 0}`).join("|");
  }

  function run({
    monthlySpend,
    valuationMode = "estimated",
    targetCardCount = 3,
    targetMode = "total",
    manualCardIds = [],
    manualEnabled = true,
    excludeFeeCards = false,
    excludeBusinessCards = false
  }) {
    const selectedManualIds = manualEnabled ? normalizeManualIds(manualCardIds) : [];
    const unlockedCards = filterUnlockedCards({
      manualIds: selectedManualIds,
      excludeFeeCards,
      excludeBusinessCards
    });

    const numericTarget = Math.max(0, Number(targetCardCount) || 0);
    const additionalTarget = targetMode === "additional"
      ? numericTarget
      : Math.max(0, numericTarget - selectedManualIds.length);
    const k = Math.max(0, Math.min(additionalTarget, unlockedCards.length));

    const annualSpend = annualizeMonthlySpend(monthlySpend || {}, schema);
    const additionalIds = unlockedCards.map((card) => card.id);

    const cacheKey = [
      spendKey(monthlySpend),
      valuationMode,
      k,
      targetMode,
      manualEnabled ? "manual-on" : "manual-off",
      excludeFeeCards ? "exclude-fee" : "all-fees",
      excludeBusinessCards ? "exclude-business" : "all-business",
      selectedManualIds.slice().sort().join(","),
      additionalIds.join(",")
    ].join("::");

    let best = comboCache.get(cacheKey);
    if (!best) {
      best = findBestCombo({
        cards: eligibleCards,
        programsMap,
        schema,
        k,
        annualSpend,
        valuationMode,
        lockedCardIds: selectedManualIds,
        additionalCardIds: additionalIds
      });
      comboCache.set(cacheKey, best);
    }

    return {
      best,
      annualSpend,
      selectedManualIds,
      unlockedCards,
      maxAdditionalCards: unlockedCards.length,
      targetAdditionalCards: k
    };
  }

  return { run, normalizeManualIds };
}
