import { annualizeMonthlySpend, chexyAdjustedAnnualSpend } from "../optimizer.js";
import { clampInt, readMonthlySpend, readSubcategoryMonthlySpend, renderResult, resetSubcategorySpend } from "../ui.js";
import { candidatePools, kBounds, selectedLockedCardIds } from "./state.js";
import { renderLockedChip } from "../shared/render.js";
import { bindCardSearchKeyboard, createCardSearchIndex, rankCardMatches, renderCardSearchOptions } from "../shared/card-search.js";
import { buildSearchText, scoreSearchMatch, tokenizeSearchQuery } from "../shared/search.js";
import { escapeHtml } from "../shared/sanitize.js";

export function createActions({ state, view, schema, programsMap, eligibleCards, eligibleCardIdSet, eligibleCardsById, subcategoryConfigs = {} }) {
  const { elements } = view;
  const comboCache = new Map();
  const cardSearchIndex = createCardSearchIndex(eligibleCards);

  const cashbackProgramIds = new Set([...programsMap.values()]
    .filter((program) => (program.program_type ?? "points") === "cashback")
    .map((program) => program.program_id));

  let optimizeWorker = null;
  let runTokenCounter = 0;
  const pendingRequests = new Map();
  let shouldRenderLockedCardPicks = true;
  let hasManualOptimizationRun = false;

  function syncStateFromControls() {
    state.valuationMode = elements.valuationModeEl?.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
    const maxAnnualFeeRaw = elements.maxAnnualFeeEl?.value?.trim?.() ?? "";
    state.maxAnnualFee = maxAnnualFeeRaw === "" ? null : Math.max(0, Number(maxAnnualFeeRaw) || 0);
    const chexyFeeRaw = elements.chexyFeePercentEl?.value?.trim?.() ?? "";
    state.chexyFeePercent = chexyFeeRaw === "" ? 0 : Math.max(0, Number(chexyFeeRaw) || 0);
    state.includeBusinessCards = Boolean(elements.includeBusinessCardsEl?.checked);
    state.excludeCashbackPrograms = Boolean(elements.excludeCashbackProgramsEl?.checked);
    state.enableLockedCards = Boolean(elements.enableLockedCardsEl?.checked);
    state.k = Number(elements.kInput?.value || state.k || 0);
  }

  function sanitizeLockedCardSelection() {
    for (const id of [...state.lockedCardIds]) {
      if (!eligibleCardIdSet.has(id)) state.lockedCardIds.delete(id);
    }
  }

  function syncKBoundsFromState() {
    const { additionalCards } = candidatePools(state, eligibleCards, eligibleCardIdSet, cashbackProgramIds);
    const { min, max } = kBounds(state, additionalCards.length);
    elements.kInput.min = String(min);
    elements.kInput.max = String(max);
    const clamped = clampInt(elements.kInput.value, min, max);
    elements.kInput.value = String(clamped);
    state.k = clamped;
    return { min, max, additionalCards };
  }

  function searchMatches(query) {
    return rankCardMatches(cardSearchIndex, query, {
      excludeCardIds: state.lockedCardIds,
      limit: 10
    });
  }

  function renderLockedCardPicks() {
    if (!elements.lockedCardPicksEl) return;
    const ids = selectedLockedCardIds(state, eligibleCardIdSet);
    elements.lockedCardPicksEl.innerHTML = "";

    if (!ids.length) {
      elements.lockedCardPicksEl.textContent = "No locked cards selected.";
      return;
    }

    const fragment = document.createDocumentFragment();
    ids.forEach((id, idx) => {
      const card = eligibleCardsById.get(id);
      if (card) {
        fragment.append(renderLockedChip(card));
      } else {
        const chip = document.createElement("span");
        chip.className = "chip";

        const label = document.createElement("span");
        label.textContent = id;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "chipRemove";
        remove.dataset.removeId = id;
        remove.setAttribute("aria-label", `Remove locked card ${id}`);
        remove.textContent = "×";

        chip.append(label, " ", remove);
        fragment.append(chip);
      }

      if (idx < ids.length - 1) fragment.append(" ");
    });

    elements.lockedCardPicksEl.append(fragment);
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
    renderCardSearchOptions(elements.lockedCardOptionsEl, matches, {
      dataAttribute: "cardId",
      thumbClass: "thumb thumb-xs thumb-contain",
      getAriaLabel: (card) => `Add locked card ${card.card_name} (${card.issuer})`
    });
  }


  function programMatches(query) {
    const queryTokens = tokenizeSearchQuery(query);
    if (!queryTokens.length) return [];

    return [...programsMap.values()]
      .filter((program) => (program.program_type ?? "points") !== "cashback")
      .filter((program) => !state.excludedProgramIds.has(program.program_id))
      .map((program) => {
        const programNameText = buildSearchText(program.program_name || program.program_id);
        const fullSearchText = buildSearchText([program.program_name, program.program_id]);
        const fullScore = scoreSearchMatch(fullSearchText, queryTokens);
        if (fullScore < 0) return null;

        const nameScore = scoreSearchMatch(programNameText, queryTokens);
        const totalScore = fullScore + (nameScore > 0 ? nameScore * 3 : 0);
        return { program, totalScore };
      })
      .filter(Boolean)
      .sort((a, b) => b.totalScore - a.totalScore || String(a.program.program_name || a.program.program_id).localeCompare(String(b.program.program_name || b.program.program_id)))
      .slice(0, 10)
      .map(({ program }) => program);
  }

  function renderExcludedProgramSearchResults() {
    if (!elements.excludedProgramOptionsEl || !elements.excludedProgramSearchEl) return;

    const matches = programMatches(elements.excludedProgramSearchEl.value || "");
    if (!matches.length) {
      elements.excludedProgramOptionsEl.classList.add("hidden");
      elements.excludedProgramOptionsEl.innerHTML = "";
      return;
    }

    elements.excludedProgramOptionsEl.classList.remove("hidden");
    elements.excludedProgramOptionsEl.innerHTML = "";

    const fragment = document.createDocumentFragment();
    matches.forEach((program) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "listOption";
      button.dataset.programId = program.program_id;
      button.setAttribute("aria-label", `Exclude rewards program ${program.program_name || program.program_id}`);
      button.textContent = program.program_name || program.program_id;
      fragment.append(button);
    });

    elements.excludedProgramOptionsEl.append(fragment);
  }

  function renderExcludedProgramPicks() {
    if (!elements.excludedProgramPicksEl) return;

    const ids = [...state.excludedProgramIds]
      .filter((programId) => programsMap.has(programId))
      .sort((a, b) => String(programsMap.get(a)?.program_name || a).localeCompare(String(programsMap.get(b)?.program_name || b)));

    elements.excludedProgramPicksEl.innerHTML = "";
    if (!ids.length) {
      elements.excludedProgramPicksEl.textContent = "No excluded rewards programs.";
      return;
    }

    const fragment = document.createDocumentFragment();
    ids.forEach((programId, idx) => {
      const chip = document.createElement("span");
      chip.className = "chip";

      const label = document.createElement("span");
      label.textContent = programsMap.get(programId)?.program_name || programId;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chipRemove";
      remove.dataset.removeProgramId = programId;
      remove.setAttribute("aria-label", `Remove excluded program ${label.textContent}`);
      remove.textContent = "×";

      chip.append(label, " ", remove);
      fragment.append(chip);
      if (idx < ids.length - 1) fragment.append(" ");
    });

    elements.excludedProgramPicksEl.append(fragment);
  }

  function updateLockedCardsUi() {
    const lockedCardCountBeforeSanitize = state.lockedCardIds.size;
    sanitizeLockedCardSelection();
    if (state.lockedCardIds.size !== lockedCardCountBeforeSanitize) {
      shouldRenderLockedCardPicks = true;
    }
    for (const programId of [...state.excludedProgramIds]) {
      if (!programsMap.has(programId)) state.excludedProgramIds.delete(programId);
    }
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

    if (shouldRenderLockedCardPicks) {
      renderLockedCardPicks();
      shouldRenderLockedCardPicks = false;
    }
    renderLockedSearchResults();
    renderExcludedProgramPicks();
    renderExcludedProgramSearchResults();
  }

  function serializeCacheParts(parts) {
    return parts.join("::");
  }

  function spendKey(monthlySpend) {
    return schema.map((cat) => `${cat}:${monthlySpend[cat] || 0}`).join("|");
  }

  function subcategorySpendKey(subcategorySpend) {
    const keys = Object.values(subcategoryConfigs).flat().map((config) => config.key).sort();
    return keys.map((key) => `${key}:${subcategorySpend[key] || 0}`).join("|");
  }

  function getBestComboSyncCache(additionalCards, annualSpend, monthlySpend, subcategorySpend, lockedIds) {
    const maxAnnualFee = Number.isFinite(state.maxAnnualFee) ? state.maxAnnualFee : "none";
    const includeBusinessCards = state.includeBusinessCards ? "includeBusiness" : "excludeBusiness";
    const excludeCashbackPrograms = state.excludeCashbackPrograms ? "excludeCashback" : "includeCashback";
    const excludedProgramsKey = [...state.excludedProgramIds].sort().join(",");
    const lockKey = [...lockedIds].sort().join(",");
    const additionalIdsKey = additionalCards.map((card) => card.id).sort().join(",");
    const key = serializeCacheParts([
      spendKey(monthlySpend),
      subcategorySpendKey(subcategorySpend),
      `chexyFee:${state.chexyFeePercent || 0}`,
      state.valuationMode,
      String(state.k),
      String(maxAnnualFee),
      includeBusinessCards,
      excludeCashbackPrograms,
      excludedProgramsKey,
      lockKey,
      additionalIdsKey
    ]);
    return {
      key,
      cached: comboCache.get(key) || null,
      payload: {
        cards: eligibleCards,
        programs: [...programsMap.values()],
        schema,
        k: state.k,
        annualSpend,
        subcategorySpend,
        subcategoryConfigs,
        valuationMode: state.valuationMode,
        excludedProgramIds: [...state.excludedProgramIds],
        excludeCashbackPrograms: state.excludeCashbackPrograms,
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
    runTokenCounter += 1;
    const requestId = runTokenCounter;

    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });

      optimizeWorker.postMessage({ requestId, payload });
    });
  }

  async function runOptimization({ manual = false } = {}) {
    if (manual) hasManualOptimizationRun = true;
    if (!hasManualOptimizationRun) return;

    syncStateFromControls();
    elements.runBtn.disabled = true;
    view.setLoadingState(true);

    updateLockedCardsUi();
    const { additionalCards } = syncKBoundsFromState();
    view.updateKValue(elements.kInput.value);

    if (!eligibleCards.length) {
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.classList.remove("resultEmpty");
      elements.resultEl.innerHTML = `<span class="badge bad">No result</span> No eligible cards are available for optimization.`;
      elements.runBtn.disabled = false;
      return;
    }

    if (state.k > 0 && !additionalCards.length) {
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.classList.remove("resultEmpty");
      elements.resultEl.innerHTML = `<span class="badge bad">No result</span> No additional cards without annual fees are available.`;
      elements.runBtn.disabled = false;
      return;
    }

    const monthlySpend = readMonthlySpend(schema);
    const subcategorySpend = readSubcategoryMonthlySpend(subcategoryConfigs);
    const hasSpend = schema.some((cat) => (monthlySpend[cat] || 0) > 0);
    if (!hasSpend) {
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.classList.add("resultEmpty");
      elements.resultEl.innerHTML = `<span class="muted">Enter monthly spend in at least one category to generate card recommendations.</span>`;
      elements.runBtn.disabled = false;
      return;
    }

    const annualSpend = annualizeMonthlySpend(monthlySpend, schema);
    const chexySummary = chexyAdjustedAnnualSpend({
      annualSpend,
      monthlySpend,
      subcategorySpend,
      subcategoryConfigs,
      chexyFeePercent: state.chexyFeePercent
    });
    const adjustedAnnualSpend = chexySummary.adjustedAnnualSpend;

    const selectedLockedIds = selectedLockedCardIds(state, eligibleCardIdSet);
    const { key, cached, payload } = getBestComboSyncCache(additionalCards, adjustedAnnualSpend, monthlySpend, subcategorySpend, selectedLockedIds);

    if (cached) {
      view.setLoadingState(false);
      renderResult(elements.resultEl, cached, adjustedAnnualSpend, schema, state.valuationMode, chexySummary, subcategoryConfigs);
      elements.runBtn.disabled = false;
      return;
    }

    const requestId = runTokenCounter + 1;

    try {
      const best = await runOptimizationInWorker(payload);
      if (requestId !== runTokenCounter) return;
      comboCache.set(key, best);
      view.setLoadingState(false);
      renderResult(elements.resultEl, best, adjustedAnnualSpend, schema, state.valuationMode, chexySummary, subcategoryConfigs);
    } catch (error) {
      if (requestId !== runTokenCounter) return;
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.classList.remove("resultEmpty");
      elements.resultEl.innerHTML = `<span class="badge bad">Error</span> ${escapeHtml(error?.message || "Failed to optimize")}`;
    } finally {
      if (requestId === runTokenCounter) elements.runBtn.disabled = false;
    }
  }

  function runOptimizationManually() {
    return runOptimization({ manual: true });
  }

  function toggleLockedCards() {
    syncStateFromControls();
    shouldRenderLockedCardPicks = true;
    return runOptimization();
  }

  function clearSpend() {
    elements.spendTableEl.querySelectorAll("input[data-cat]").forEach((input) => {
      input.value = "";
    });
    Object.values(subcategoryConfigs).flat().forEach((config) => resetSubcategorySpend(config.key));
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
    shouldRenderLockedCardPicks = true;
    if (elements.lockedCardSearchEl) elements.lockedCardSearchEl.value = "";
    return runOptimization();
  }

  function removeLockedCard(cardId) {
    state.lockedCardIds.delete(cardId);
    shouldRenderLockedCardPicks = true;
    return runOptimization();
  }

  function setMaxAnnualFee(value) {
    const raw = String(value ?? "").trim();
    state.maxAnnualFee = raw === "" ? null : Math.max(0, Number(raw) || 0);
    if (elements.maxAnnualFeeEl) elements.maxAnnualFeeEl.value = raw;
    return runOptimization();
  }

  function setIncludeBusinessCards(enabled) {
    state.includeBusinessCards = Boolean(enabled);
    if (elements.includeBusinessCardsEl) elements.includeBusinessCardsEl.checked = state.includeBusinessCards;
    return runOptimization();
  }

  function setExcludeCashbackPrograms(enabled) {
    state.excludeCashbackPrograms = Boolean(enabled);
    if (elements.excludeCashbackProgramsEl) elements.excludeCashbackProgramsEl.checked = state.excludeCashbackPrograms;
    return runOptimization();
  }

  function setProgramExcluded(programId, excluded) {
    if (!programId) return;
    if (excluded) state.excludedProgramIds.add(programId);
    else state.excludedProgramIds.delete(programId);
  }

  function addExcludedProgram(programId) {
    setProgramExcluded(programId, true);
    if (elements.excludedProgramSearchEl) elements.excludedProgramSearchEl.value = "";
    return runOptimization();
  }

  function removeExcludedProgram(programId) {
    setProgramExcluded(programId, false);
    return runOptimization();
  }

  function resetAdvancedPreferences() {
    state.maxAnnualFee = null;
    state.chexyFeePercent = 1.75;
    state.includeBusinessCards = false;
    state.excludeCashbackPrograms = false;
    state.excludedProgramIds.clear();

    if (elements.maxAnnualFeeEl) elements.maxAnnualFeeEl.value = "";
    if (elements.includeBusinessCardsEl) elements.includeBusinessCardsEl.checked = false;
    if (elements.chexyFeePercentEl) elements.chexyFeePercentEl.value = "1.75";
    if (elements.excludeCashbackProgramsEl) elements.excludeCashbackProgramsEl.checked = false;
    if (elements.excludedProgramSearchEl) elements.excludedProgramSearchEl.value = "";
    elements.excludedProgramOptionsEl?.classList.add("hidden");
    if (elements.excludedProgramOptionsEl) elements.excludedProgramOptionsEl.innerHTML = "";

    return runOptimization();
  }


  function hydrateFromDeepLink(payload = {}) {
    const lockedIds = Array.isArray(payload.lockedCardIds) ? payload.lockedCardIds : [];
    const isCurrentCardsMode = payload.mode === "current_cards" || payload.quizResponses?.goal === "current_cards";

    state.lockedCardIds = new Set(lockedIds);
    state.enableLockedCards = isCurrentCardsMode || lockedIds.length > 0;
    elements.enableLockedCardsEl.checked = state.enableLockedCards;

    const valuationMode = payload.valuationMode === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
    state.valuationMode = valuationMode;
    if (elements.valuationModeEl) elements.valuationModeEl.value = valuationMode;

    if (isCurrentCardsMode) {
      // Current-cards mode always means no additional cards on first optimizer load.
      state.enableLockedCards = true;
      elements.enableLockedCardsEl.checked = true;
      elements.kInput.min = "0";
      elements.kInput.value = "0";
      state.k = 0;
      view.updateKValue(0);
    } else if (Number.isFinite(payload.k)) {
      elements.kInput.value = String(Math.max(0, Number(payload.k) || 0));
      state.k = Number(elements.kInput.value);
      view.updateKValue(state.k);
    }

    elements.spendTableEl.querySelectorAll("input[data-cat]").forEach((input) => {
      const key = input.dataset.cat;
      const value = Number(payload.spend?.[key] || 0);
      input.value = value > 0 ? String(value) : "";
    });

    elements.spendTableEl.querySelectorAll("input[data-subcategory-key]").forEach((input) => {
      const key = input.dataset.subcategoryKey;
      const value = Number(payload.subcategorySpend?.[key] || 0);
      input.value = value > 0 ? String(value) : "";
    });

    shouldRenderLockedCardPicks = true;
    return runOptimization();
  }

  initWorker();

  return {
    runOptimization,
    runOptimizationManually,
    toggleLockedCards,
    clearSpend,
    setValuationMode,
    setK,
    addLockedCard,
    removeLockedCard,
    setMaxAnnualFee,
    setIncludeBusinessCards,
    setExcludeCashbackPrograms,
    addExcludedProgram,
    removeExcludedProgram,
    resetAdvancedPreferences,
    renderLockedSearchResults,
    renderExcludedProgramSearchResults,
    hydrateFromDeepLink,
    syncInitialUi: () => {
      if (elements.chexyFeePercentEl && !elements.chexyFeePercentEl.value) elements.chexyFeePercentEl.value = "1.75";
      syncStateFromControls();
      shouldRenderLockedCardPicks = true;
      updateLockedCardsUi();
      syncKBoundsFromState();
      view.updateKValue(elements.kInput.value);
      if (elements.lockedCardSearchEl && elements.lockedCardOptionsEl) {
        bindCardSearchKeyboard(elements.lockedCardSearchEl, elements.lockedCardOptionsEl, addLockedCard);
      }
    },
    terminateWorker
  };
}
