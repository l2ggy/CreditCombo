import { annualizeMonthlySpend } from "../optimizer.js";
import { clampInt, readMonthlySpend, renderResult } from "../ui.js";
import { candidatePools, kBounds, selectedLockedCardIds } from "./state.js";
import { renderCardThumb, renderLockedChip } from "../shared/render.js";
import { buildSearchText, scoreSearchMatch, tokenizeSearchQuery } from "../shared/search.js";
import { escapeHtml } from "../shared/sanitize.js";

export function createActions({ state, view, schema, programsMap, eligibleCards, eligibleCardIdSet, eligibleCardsById }) {
  const { elements } = view;
  const comboCache = new Map();

  let optimizeWorker = null;
  let optimizeRequestId = 0;
  const pendingRequests = new Map();

  function syncStateFromControls() {
    state.valuationMode = elements.valuationModeEl?.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
    const maxAnnualFeeRaw = elements.maxAnnualFeeEl?.value?.trim?.() ?? "";
    state.maxAnnualFee = maxAnnualFeeRaw === "" ? null : Math.max(0, Number(maxAnnualFeeRaw) || 0);
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
    const queryTokens = tokenizeSearchQuery(query);
    if (!queryTokens.length) return [];

    return eligibleCards
      .filter((card) => !state.lockedCardIds.has(card.id))
      .map((card) => {
        const cardNameText = buildSearchText(card.card_name);
        const fullSearchText = buildSearchText([card.card_name, card.issuer, card.network]);
        const fullScore = scoreSearchMatch(fullSearchText, queryTokens);

        if (fullScore < 0) return null;

        const nameScore = scoreSearchMatch(cardNameText, queryTokens);
        const totalScore = fullScore + (nameScore > 0 ? nameScore * 3 : 0);
        return { card, totalScore };
      })
      .filter(Boolean)
      .sort((a, b) => b.totalScore - a.totalScore || a.card.card_name.localeCompare(b.card.card_name))
      .slice(0, 10)
      .map(({ card }) => card);
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
    elements.lockedCardOptionsEl.innerHTML = "";

    const fragment = document.createDocumentFragment();
    matches.forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "listOption";
      button.dataset.cardId = card.id;
      button.setAttribute("aria-label", `Add locked card ${card.card_name} (${card.issuer})`);

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


  function renderProgramPreferences() {
    if (!elements.programPrefsEl) return;
    const programs = [...programsMap.values()]
      .sort((a, b) => String(a.program_name || a.program_id).localeCompare(String(b.program_name || b.program_id)));

    elements.programPrefsEl.innerHTML = "";
    const fragment = document.createDocumentFragment();

    programs.forEach((program) => {
      const row = document.createElement("div");
      row.className = "programPrefRow";

      const meta = document.createElement("div");
      meta.className = "programPrefMeta";

      const name = document.createElement("label");
      name.className = "programPrefName";
      name.htmlFor = `excludeProgram-${program.program_id}`;
      name.textContent = program.program_name || program.program_id;

      const type = document.createElement("span");
      type.className = "programPrefType";
      type.textContent = (program.program_type ?? "points") === "cashback" ? "Cashback" : "Points";

      meta.append(name, type);

      const inputWrap = document.createElement("div");
      inputWrap.className = "programPrefInput";

      const excludeLabel = document.createElement("label");
      excludeLabel.className = "checkboxLabel";

      const excludeInput = document.createElement("input");
      excludeInput.type = "checkbox";
      excludeInput.id = `excludeProgram-${program.program_id}`;
      excludeInput.dataset.programExclude = program.program_id;
      excludeInput.checked = state.excludedProgramIds.has(program.program_id);

      excludeLabel.append(excludeInput, "Exclude");
      inputWrap.append(excludeLabel);

      if ((program.program_type ?? "points") !== "cashback") {
        const cppInput = document.createElement("input");
        cppInput.type = "number";
        cppInput.step = "0.01";
        cppInput.min = "0";
        cppInput.dataset.programCpp = program.program_id;
        cppInput.placeholder = String(program.cents_per_point ?? "");
        const customValue = state.customProgramCpp[program.program_id];
        cppInput.value = Number.isFinite(customValue) ? String(customValue) : "";
        cppInput.setAttribute("aria-label", `Custom CPP for ${program.program_name || program.program_id}`);
        inputWrap.append(cppInput);
      }

      row.append(meta, inputWrap);
      fragment.append(row);
    });

    elements.programPrefsEl.append(fragment);
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
    const maxAnnualFee = Number.isFinite(state.maxAnnualFee) ? state.maxAnnualFee : "none";
    const excludeBusinessCards = state.excludeBusinessCards ? "excludeBusiness" : "includeBusiness";
    const excludedProgramsKey = [...state.excludedProgramIds].sort().join(",");
    const customCppKey = Object.entries(state.customProgramCpp).sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => `${id}:${value}`).join(",");
    const lockKey = [...lockedIds].sort().join(",");
    const additionalIdsKey = additionalCards.map((card) => card.id).sort().join(",");
    const key = `${spendKey(monthlySpend)}::${state.valuationMode}::${state.k}::${maxAnnualFee}::${excludeBusinessCards}::${excludedProgramsKey}::${customCppKey}::${lockKey}::${additionalIdsKey}`;
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
        excludedProgramIds: [...state.excludedProgramIds],
        customProgramCpp: state.customProgramCpp,
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

    if (state.k > 0 && !additionalCards.length) {
      view.setLoadingState(false);
      elements.resultEl.classList.remove("hidden");
      elements.resultEl.innerHTML = `<span class="badge bad">No result</span> No additional cards match your advanced preferences.`;
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

  function setMaxAnnualFee(value) {
    const raw = String(value ?? "").trim();
    state.maxAnnualFee = raw === "" ? null : Math.max(0, Number(raw) || 0);
    if (elements.maxAnnualFeeEl) elements.maxAnnualFeeEl.value = raw;
    return runOptimization();
  }

  function setExcludeBusinessCards(enabled) {
    state.excludeBusinessCards = Boolean(enabled);
    if (elements.excludeBusinessCardsEl) elements.excludeBusinessCardsEl.checked = state.excludeBusinessCards;
    return runOptimization();
  }

  function setProgramExcluded(programId, excluded) {
    if (!programId) return runOptimization();
    if (excluded) state.excludedProgramIds.add(programId);
    else state.excludedProgramIds.delete(programId);
    return runOptimization();
  }

  function setProgramCustomCpp(programId, rawValue) {
    if (!programId) return runOptimization();
    const raw = String(rawValue ?? "").trim();
    if (!raw) {
      delete state.customProgramCpp[programId];
      return runOptimization();
    }

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric >= 0) state.customProgramCpp[programId] = numeric;
    else delete state.customProgramCpp[programId];

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
    setMaxAnnualFee,
    setExcludeBusinessCards,
    setProgramExcluded,
    setProgramCustomCpp,
    renderLockedSearchResults,
    syncInitialUi: () => {
      syncStateFromControls();
      updateLockedCardsUi();
      syncKBoundsFromState();
      renderProgramPreferences();
      view.updateKValue(elements.kInput.value);
    },
    terminateWorker
  };
}
