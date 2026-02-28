import { annualizeMonthlySpend } from "../optimizer.js";
import { clampInt, readMonthlySpend, renderResult } from "../ui.js";
import { candidatePools, kBounds, selectedLockedCardIds } from "./state.js";
import { renderCardThumb, renderLockedChip } from "../shared/render.js";

export function createActions({ state, view, schema, programsMap, eligibleCards, eligibleCardIdSet, eligibleCardsById }) {
  const { elements } = view;
  const comboCache = new Map();
  const chipAnimationMs = 160;

  let optimizeWorker = null;
  let optimizeRequestId = 0;
  const pendingRequests = new Map();
  let lockedChipRenderToken = 0;

  function prefersReducedMotion() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function createLockedChipNode(id) {
    const card = eligibleCardsById.get(id);
    const chip = card ? renderLockedChip(card) : document.createElement("span");

    if (!card) {
      chip.className = "chip";

      const label = document.createElement("span");
      label.textContent = id;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chipRemove";
      remove.dataset.removeId = id;
      remove.setAttribute("aria-label", `Remove ${id}`);
      remove.textContent = "×";

      chip.append(label, " ", remove);
    }

    chip.dataset.lockedCardId = id;
    return chip;
  }

  function removeChipNode(chip, reducedMotion) {
    if (reducedMotion) {
      chip.remove();
      return;
    }

    chip.classList.remove("chip-enter");
    chip.classList.add("chip-exit");
    window.setTimeout(() => {
      chip.remove();
    }, chipAnimationMs);
  }

  function syncStateFromControls() {
    state.valuationMode = elements.valuationModeEl?.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
    state.excludeFeeCards = Boolean(elements.excludeFeeCardsEl?.checked);
    state.excludeBusinessCards = Boolean(elements.excludeBusinessCardsEl?.checked);
    state.enableLockedCards = Boolean(elements.enableLockedCardsEl?.checked);
    state.k = Number(elements.kInput?.value || state.k || 0);
  }

  function sanitizeLockedCardSelection() {
    for (const id of [...state.lockedCardIds]) {
      if (!eligibleCardIdSet.has(id)) state.lockedCardIds.delete(id);
    }
  }

  function syncKBoundsFromState() {
    const { additionalCards } = candidatePools(state, eligibleCards, eligibleCardIdSet);
    const { min, max } = kBounds(state, additionalCards.length);
    elements.kInput.min = String(min);
    elements.kInput.max = String(max);
    const clamped = clampInt(elements.kInput.value, min, max);
    elements.kInput.value = String(clamped);
    state.k = clamped;
    return { min, max, additionalCards };
  }

  function searchMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return eligibleCards
      .filter((card) => !state.lockedCardIds.has(card.id))
      .filter((card) => `${card.card_name} ${card.issuer} ${card.network}`.toLowerCase().includes(q))
      .slice(0, 10);
  }

  function renderLockedCardPicks() {
    if (!elements.lockedCardPicksEl) return;
    const ids = selectedLockedCardIds(state, eligibleCardIdSet);
    const picksEl = elements.lockedCardPicksEl;
    const reducedMotion = prefersReducedMotion();
    const renderToken = ++lockedChipRenderToken;

    const currentChips = new Map(
      [...picksEl.querySelectorAll(".chip[data-locked-card-id]")].map((chip) => [chip.dataset.lockedCardId, chip])
    );
    const nextIdSet = new Set(ids);

    if (!picksEl.querySelector(".chip") && picksEl.textContent?.trim()) picksEl.textContent = "";

    currentChips.forEach((chip, id) => {
      if (!nextIdSet.has(id)) removeChipNode(chip, reducedMotion);
    });

    if (!ids.length) {
      if (reducedMotion || currentChips.size === 0) {
        picksEl.textContent = "No locked cards selected.";
      } else {
        window.setTimeout(() => {
          if (renderToken !== lockedChipRenderToken) return;
          if (picksEl.querySelector(".chip")) return;
          picksEl.textContent = "No locked cards selected.";
        }, chipAnimationMs);
      }
      return;
    }

    ids.forEach((id) => {
      let chip = currentChips.get(id);
      if (!chip) {
        chip = createLockedChipNode(id);
        if (!reducedMotion) {
          chip.classList.add("chip-enter");
          window.requestAnimationFrame(() => {
            chip.classList.remove("chip-enter");
          });
        }
      }

      picksEl.append(chip);
    });
  }

  function renderLockedSearchResults() {
    if (!elements.lockedCardOptionsEl || !elements.lockedCardSearchEl) return;
    const matches = searchMatches(elements.lockedCardSearchEl.value || "");
    if (!matches.length) {
      elements.lockedCardOptionsEl.classList.add("hidden");
      elements.lockedCardOptionsEl.innerHTML = "";
      return;
    }

    elements.lockedCardOptionsEl.classList.remove("hidden");
    elements.lockedCardOptionsEl.innerHTML = "";

    const fragment = document.createDocumentFragment();
    matches.forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "listOption";
      button.dataset.cardId = card.id;

      button.append(renderCardThumb(card, { className: "thumb thumb-xs thumb-contain", withFrame: false }));

      const label = document.createElement("span");
      label.textContent = `${card.card_name} `;

      const issuer = document.createElement("span");
      issuer.className = "muted";
      issuer.textContent = `(${card.issuer})`;

      label.append(issuer);
      button.append(label);
      fragment.append(button);
    });

    elements.lockedCardOptionsEl.append(fragment);
  }

  function updateLockedCardsUi() {
    sanitizeLockedCardSelection();
    const enabled = state.enableLockedCards;
    elements.lockedCardsPanelEl?.classList.toggle("hidden", !enabled);
    elements.lockedCardsDividerEl?.classList.toggle("hidden", !enabled);

    if (!enabled) {
      if (elements.lockedCardSearchEl) elements.lockedCardSearchEl.value = "";
      elements.lockedCardOptionsEl?.classList.add("hidden");
      if (elements.lockedCardOptionsEl) elements.lockedCardOptionsEl.innerHTML = "";
    }

    if (elements.kLabelEl) {
      elements.kLabelEl.textContent = enabled ? "Additional cards" : "Number of cards";
    }

    renderLockedCardPicks();
    renderLockedSearchResults();
  }

  function spendKey(monthlySpend) {
    return schema.map((cat) => `${cat}:${monthlySpend[cat] || 0}`).join("|");
  }

  function getBestComboSyncCache(additionalCards, annualSpend, monthlySpend, lockedIds) {
    const excludeFeeCards = state.excludeFeeCards ? "excludeFee" : "allCards";
    const excludeBusinessCards = state.excludeBusinessCards ? "excludeBusiness" : "includeBusiness";
    const lockKey = [...lockedIds].sort().join(",");
    const additionalIdsKey = additionalCards.map((card) => card.id).sort().join(",");
    const key = `${spendKey(monthlySpend)}::${state.valuationMode}::${state.k}::${excludeFeeCards}::${excludeBusinessCards}::${lockKey}::${additionalIdsKey}`;
    return {
      key,
      cached: comboCache.get(key) || null,
      payload: {
        cards: eligibleCards,
        programs: [...programsMap.values()],
        schema,
        k: state.k,
        annualSpend,
        valuationMode: state.valuationMode,
        lockedCardIds: lockedIds,
        additionalCardIds: additionalCards.map((card) => card.id)
      }
    };
  }

  function terminateWorker() {
    if (!optimizeWorker) return;
    optimizeWorker.terminate();
    optimizeWorker = null;
    pendingRequests.clear();
  }

  function initWorker() {
    if (optimizeWorker) return;

    optimizeWorker = new Worker(new URL("../optimizer-worker.js", import.meta.url), { type: "module" });

    optimizeWorker.addEventListener("message", (event) => {
      const msg = event.data || {};
      const pending = pendingRequests.get(msg.requestId);
      if (!pending) return;
      pendingRequests.delete(msg.requestId);

      if (msg.error) {
        pending.reject(new Error(msg.error));
        return;
      }

      pending.resolve(msg.result);
    });

    optimizeWorker.addEventListener("error", (event) => {
      const error = new Error(event?.message || "Worker error");
      for (const pending of pendingRequests.values()) {
        pending.reject(error);
      }
      pendingRequests.clear();
    });
  }

  function runOptimizationInWorker(payload) {
    initWorker();
    optimizeRequestId += 1;
    const requestId = optimizeRequestId;

    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });

      optimizeWorker.postMessage({ requestId, payload });
    });
  }

  async function runOptimization() {
    syncStateFromControls();
    elements.runBtn.disabled = true;
    view.setLoadingState(true);

    updateLockedCardsUi();
    const { additionalCards } = syncKBoundsFromState();
    view.updateKValue(elements.kInput.value);

    if (!eligibleCards.length) {
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.innerHTML = `<span class="badge bad">No result</span> No eligible cards are available for optimization.`;
      elements.runBtn.disabled = false;
      return;
    }

    if (state.excludeFeeCards && state.k > 0 && !additionalCards.length) {
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.innerHTML = `<span class="badge bad">No result</span> No additional cards without annual fees are available.`;
      elements.runBtn.disabled = false;
      return;
    }

    const monthlySpend = readMonthlySpend(schema);
    const hasSpend = schema.some((cat) => (monthlySpend[cat] || 0) > 0);
    if (!hasSpend) {
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.innerHTML = `<span class="muted">Enter monthly spend in at least one category to generate card recommendations.</span>`;
      elements.runBtn.disabled = false;
      return;
    }

    const annualSpend = annualizeMonthlySpend(monthlySpend, schema);
    const selectedLockedIds = selectedLockedCardIds(state, eligibleCardIdSet);
    const { key, cached, payload } = getBestComboSyncCache(additionalCards, annualSpend, monthlySpend, selectedLockedIds);

    if (cached) {
      view.setLoadingState(false);
      renderResult(elements.resultEl, cached, annualSpend, schema, state.valuationMode);
      elements.runBtn.disabled = false;
      return;
    }

    const requestId = optimizeRequestId + 1;

    try {
      const best = await runOptimizationInWorker(payload);
      if (requestId !== optimizeRequestId) return;
      comboCache.set(key, best);
      view.setLoadingState(false);
      renderResult(elements.resultEl, best, annualSpend, schema, state.valuationMode);
    } catch (error) {
      if (requestId !== optimizeRequestId) return;
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.innerHTML = `<span class="badge bad">Error</span> ${escapeHtml(error?.message || "Failed to optimize")}`;
    } finally {
      if (requestId === optimizeRequestId) elements.runBtn.disabled = false;
    }
  }

  function toggleLockedCards() {
    syncStateFromControls();
    return runOptimization();
  }

  function clearSpend() {
    elements.spendTableEl.querySelectorAll("input[data-cat]").forEach((input) => {
      input.value = "0";
    });
    return runOptimization();
  }

  function setValuationMode(mode) {
    state.valuationMode = mode === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
    if (elements.valuationModeEl) elements.valuationModeEl.value = state.valuationMode;
    return runOptimization();
  }

  function setK(value) {
    elements.kInput.value = String(value);
    syncStateFromControls();
    return runOptimization();
  }

  function addLockedCard(cardId) {
    state.lockedCardIds.add(cardId);
    if (elements.lockedCardSearchEl) elements.lockedCardSearchEl.value = "";
    return runOptimization();
  }

  function removeLockedCard(cardId) {
    state.lockedCardIds.delete(cardId);
    return runOptimization();
  }

  function setExcludeFeeCards(enabled) {
    state.excludeFeeCards = Boolean(enabled);
    if (elements.excludeFeeCardsEl) elements.excludeFeeCardsEl.checked = state.excludeFeeCards;
    return runOptimization();
  }

  function setExcludeBusinessCards(enabled) {
    state.excludeBusinessCards = Boolean(enabled);
    if (elements.excludeBusinessCardsEl) elements.excludeBusinessCardsEl.checked = state.excludeBusinessCards;
    return runOptimization();
  }

  initWorker();

  return {
    runOptimization,
    toggleLockedCards,
    clearSpend,
    setValuationMode,
    setK,
    addLockedCard,
    removeLockedCard,
    setExcludeFeeCards,
    setExcludeBusinessCards,
    renderLockedSearchResults,
    syncInitialUi: () => {
      syncStateFromControls();
      updateLockedCardsUi();
      syncKBoundsFromState();
      view.updateKValue(elements.kInput.value);
    },
    terminateWorker
  };
}
