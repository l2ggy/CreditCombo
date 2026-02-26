import { annualizeMonthlySpend, findBestCombo } from "./optimizer.js";
import { clampInt } from "./ui.js";

export function createOptimizerController(config) {
  const {
    eligibleCards,
    programsMap,
    schema,
    elements,
    readMonthlySpend,
    onResult,
    onStateChange,
    allowZeroCards = false,
    initialLockedCardIds = [],
    lockBehavior = "optional"
  } = config;

  const alwaysUseLockedCards = lockBehavior === "seed_total";

  const state = {
    lockedCardIds: new Set(initialLockedCardIds),
    comboCache: new Map(),
    lastBest: null,
    lastValuationMode: "estimated"
  };

  function selectedLockedCardIds() {
    if (!alwaysUseLockedCards && !elements.enableLockedCards?.checked) return [];
    const allowedIds = new Set(eligibleCards.map((card) => card.id));
    return [...state.lockedCardIds].filter((id) => allowedIds.has(id));
  }

  function unlockedCandidateCards() {
    const selectedIds = new Set(selectedLockedCardIds());
    let pool = eligibleCards.filter((card) => !selectedIds.has(card.id));
    if (elements.excludeFeeCards?.checked) {
      pool = pool.filter((card) => Number(card.annual_fee?.amount ?? 0) <= 0);
    }
    return pool;
  }

  function sanitizeLockedCardSelection() {
    const allowedIds = new Set(eligibleCards.map((card) => card.id));
    for (const id of [...state.lockedCardIds]) {
      if (!allowedIds.has(id)) state.lockedCardIds.delete(id);
    }
  }

  function cardsById(cards) {
    return new Map(cards.map((card) => [card.id, card]));
  }

  function updateSliderLabel() {
    if (!elements.kLabel) return;
    if (alwaysUseLockedCards) {
      elements.kLabel.textContent = "Number of cards";
      return;
    }
    elements.kLabel.textContent = elements.enableLockedCards?.checked ? "Additional cards" : "Number of cards";
  }

  function searchMatches(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];
    return eligibleCards
      .filter((card) => !state.lockedCardIds.has(card.id))
      .filter((card) => `${card.card_name} ${card.issuer} ${card.network}`.toLowerCase().includes(q))
      .slice(0, 10);
  }

  function renderLockedSearchResults() {
    if (!elements.lockedCardOptions || !elements.lockedCardSearch) return;
    const matches = searchMatches(elements.lockedCardSearch.value || "");
    if (!matches.length) {
      elements.lockedCardOptions.classList.add("hidden");
      elements.lockedCardOptions.innerHTML = "";
      return;
    }

    elements.lockedCardOptions.classList.remove("hidden");
    elements.lockedCardOptions.innerHTML = matches
      .map((card) => `<button type="button" class="lockedOption" data-card-id="${card.id}">${escapeHtml(card.card_name)} <span class="muted">(${escapeHtml(card.issuer)})</span></button>`)
      .join("");
  }

  function renderLockedCardPicks() {
    if (!elements.lockedCardPicks) return;
    const byId = cardsById(eligibleCards);
    const ids = selectedLockedCardIds();
    if (!ids.length) {
      elements.lockedCardPicks.innerHTML = "No cards selected yet.";
      return;
    }

    elements.lockedCardPicks.innerHTML = ids
      .map((id) => {
        const card = byId.get(id);
        const label = card ? `${card.card_name} (${card.issuer})` : id;
        return `<span class="lockedChip" draggable="true" data-locked-card-id="${id}">${escapeHtml(label)} <button type="button" class="lockedChipRemove" data-remove-id="${id}" aria-label="Remove ${escapeHtml(label)}">×</button></span>`;
      })
      .join(" ");
  }

  function currentMaxAdditionalCards() {
    return Math.max(0, Math.min(5, unlockedCandidateCards().length));
  }

  function syncKBounds() {
    const maxAdditionalCards = currentMaxAdditionalCards();
    if (alwaysUseLockedCards) {
      const lockedCount = selectedLockedCardIds().length;
      const maxTotal = Math.min(5, lockedCount + maxAdditionalCards);
      const minTotal = Math.max(allowZeroCards ? 0 : 1, lockedCount);
      elements.kInput.min = String(minTotal);
      elements.kInput.max = String(maxTotal);
      elements.kInput.value = String(clampInt(elements.kInput.value, minTotal, maxTotal));
      return maxTotal;
    }

    const baseMin = elements.enableLockedCards?.checked || allowZeroCards ? 0 : 1;
    const minValue = maxAdditionalCards < baseMin ? 0 : baseMin;
    elements.kInput.min = String(minValue);
    elements.kInput.max = String(maxAdditionalCards);
    elements.kInput.value = String(clampInt(elements.kInput.value, minValue, maxAdditionalCards));
    return maxAdditionalCards;
  }

  function updateKValue() {
    if (elements.kValue) elements.kValue.textContent = String(elements.kInput.value);
  }

  function currentValuationMode() {
    return elements.valuationMode?.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
  }

  function spendKey(monthlySpend) {
    return schema.map((cat) => `${cat}:${monthlySpend[cat] || 0}`).join("|");
  }

  function getBestCombo(additionalCards, k, annualSpend, valuationMode, monthlySpend, lockedIds) {
    const excludeFeeCards = elements.excludeFeeCards?.checked ? "excludeFee" : "allCards";
    const lockKey = [...lockedIds].sort().join(",");
    const additionalIdsKey = additionalCards.map((card) => card.id).sort().join(",");
    const key = `${spendKey(monthlySpend)}::${valuationMode}::${k}::${excludeFeeCards}::${lockKey}::${additionalIdsKey}`;
    if (state.comboCache.has(key)) return state.comboCache.get(key);

    const best = findBestCombo({
      cards: eligibleCards,
      programsMap,
      schema,
      k,
      annualSpend,
      valuationMode,
      lockedCardIds: lockedIds,
      additionalCardIds: additionalCards.map((card) => card.id)
    });
    state.comboCache.set(key, best);
    return best;
  }

  function updateLockedCardsUi() {
    sanitizeLockedCardSelection();
    const enabled = alwaysUseLockedCards || Boolean(elements.enableLockedCards?.checked);
    elements.lockedCardsPanel?.classList.toggle("hidden", !enabled);
    elements.lockedCardsDivider?.classList.toggle("hidden", !enabled);

    if (!enabled) {
      if (elements.lockedCardSearch) elements.lockedCardSearch.value = "";
      elements.lockedCardOptions?.classList.add("hidden");
      if (elements.lockedCardOptions) elements.lockedCardOptions.innerHTML = "";
    }

    renderLockedCardPicks();
    renderLockedSearchResults();
    updateSliderLabel();
  }

  function runOptimizer() {
    elements.runBtn.disabled = true;
    elements.result.classList.add("hidden");
    elements.result.textContent = "Computing…";

    updateLockedCardsUi();
    const selectedLockedIds = selectedLockedCardIds();
    const additionalCards = unlockedCandidateCards();

    syncKBounds();
    const minValue = Number(elements.kInput.min || 0);
    const maxValue = Number(elements.kInput.max || 0);
    const k = clampInt(elements.kInput.value, minValue, maxValue);
    elements.kInput.value = String(k);
    updateKValue();

    const additionalCount = alwaysUseLockedCards ? Math.max(0, k - selectedLockedIds.length) : k;

    if (!eligibleCards.length) {
      elements.result.classList.remove("hidden");
      elements.result.innerHTML = `<span class="badge bad">No result</span> No eligible cards are available for optimization.`;
      elements.runBtn.disabled = false;
      return;
    }

    if (elements.excludeFeeCards?.checked && additionalCount > 0 && !additionalCards.length) {
      elements.result.classList.remove("hidden");
      elements.result.innerHTML = `<span class="badge bad">No result</span> No additional cards without annual fees are available.`;
      elements.runBtn.disabled = false;
      return;
    }

    const valuationMode = currentValuationMode();
    const monthlySpend = readMonthlySpend();
    const hasSpend = schema.some((cat) => (monthlySpend[cat] || 0) > 0);
    if (!hasSpend) {
      elements.result.classList.remove("hidden");
      elements.result.innerHTML = `<span class="muted">Enter monthly spend in at least one category to generate card recommendations.</span>`;
      elements.runBtn.disabled = false;
      return;
    }

    const annualSpend = annualizeMonthlySpend(monthlySpend, schema);
    const best = getBestCombo(additionalCards, additionalCount, annualSpend, valuationMode, monthlySpend, selectedLockedIds);
    state.lastBest = best;
    state.lastValuationMode = valuationMode;
    onResult({ best, annualSpend, valuationMode, monthlySpend, selectedLockedIds });
    elements.runBtn.disabled = false;
    onStateChange?.();
  }

  function setLockedCards(ids, { enable = true } = {}) {
    state.lockedCardIds = new Set(ids || []);
    if (elements.enableLockedCards && !alwaysUseLockedCards) elements.enableLockedCards.checked = enable;
    runOptimizer();
  }

  function autoFillOptimal() {
    const monthlySpend = readMonthlySpend();
    const annualSpend = annualizeMonthlySpend(monthlySpend, schema);
    const valuationMode = currentValuationMode();
    const k = Number(elements.kInput.value || 0);
    const best = findBestCombo({
      cards: eligibleCards,
      programsMap,
      schema,
      k: alwaysUseLockedCards ? Math.max(0, k) : k,
      annualSpend,
      valuationMode,
      lockedCardIds: [],
      additionalCardIds: null
    });
    const ids = best.combo.map((card) => card.id);
    setLockedCards(ids, { enable: true });
  }

  function bindEvents() {
    elements.runBtn.addEventListener("click", runOptimizer);
    elements.kInput.addEventListener("input", runOptimizer);
    elements.valuationMode?.addEventListener("change", runOptimizer);
    elements.excludeFeeCards?.addEventListener("change", runOptimizer);
    if (!alwaysUseLockedCards) elements.enableLockedCards?.addEventListener("change", runOptimizer);

    elements.lockedCardSearch?.addEventListener("input", renderLockedSearchResults);

    elements.lockedCardOptions?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-card-id]");
      if (!btn) return;
      state.lockedCardIds.add(btn.dataset.cardId);
      if (elements.lockedCardSearch) elements.lockedCardSearch.value = "";
      runOptimizer();
    });

    elements.lockedCardPicks?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-id]");
      if (!btn) return;
      state.lockedCardIds.delete(btn.dataset.removeId);
      runOptimizer();
    });

    elements.autoFillBtn?.addEventListener("click", autoFillOptimal);
  }

  function init() {
    if (alwaysUseLockedCards && elements.enableLockedCards) elements.enableLockedCards.checked = true;
    updateLockedCardsUi();
    syncKBounds();
    updateKValue();
    bindEvents();
  }

  return {
    init,
    runOptimizer,
    setLockedCards,
    autoFillOptimal,
    getLockedCardIds: () => [...selectedLockedCardIds()],
    moveLockedCardTo: (cardId, targetController) => {
      state.lockedCardIds.delete(cardId);
      targetController.setLockedCards([...targetController.getLockedCardIds(), cardId], { enable: true });
      runOptimizer();
    },
    getLastBest: () => state.lastBest,
    getLastValuationMode: () => state.lastValuationMode
  };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
