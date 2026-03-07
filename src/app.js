import { loadOptimizerData } from "./data-service.js";
import { renderIssues, renderSpendTable } from "./ui.js";
import { createActions } from "./app/actions.js";
import { createUiState } from "./app/state.js";
import { createView } from "./app/view.js";
import { readOptimizerDeepLink } from "./app/deeplink.js";
import { escapeHtml } from "./shared/sanitize.js";
import { createShareOverlay } from "./share/share-overlay.js";

const spendInputSelector = "input[data-cat], input[data-subcategory-key]";

async function main() {
  const view = createView();
  const { elements } = view;

  try {
    const { schema, categoryDescriptions, eligibleCards, issues, programsMap, subcategoryConfigs } = await loadOptimizerData();
    const eligibleCardIdSet = new Set(eligibleCards.map((card) => card.id));
    const eligibleCardsById = new Map(eligibleCards.map((card) => [card.id, card]));

    elements.statusEl.innerHTML = `
      <span class="badge good">Loaded</span>
      <span class="muted">${eligibleCards.length} eligible cards · ${issues.length} excluded · ${programsMap.size} programs</span>
    `;

    renderSpendTable(elements.spendTableEl, schema, categoryDescriptions, subcategoryConfigs);
    renderIssues(elements.issuesEl, issues);
    view.syncIssuesVisibility(issues.length);

    let shareOverlay = null;
    const ensureShareOverlay = () => {
      if (!shareOverlay) shareOverlay = createShareOverlay();
      return shareOverlay;
    };

    const actions = createActions({
      state: createUiState(),
      view,
      schema,
      programsMap,
      eligibleCards,
      eligibleCardIdSet,
      eligibleCardsById,
      subcategoryConfigs,
      ensureShareOverlay
    });

    actions.syncInitialUi();

    const deepLinkState = readOptimizerDeepLink(window.location.search, {
      schema,
      subcategoryConfigs,
      eligibleCardIdSet
    });

    const hasDeepLinkValues = Boolean(
      deepLinkState.mode === "current_cards"
      || deepLinkState.lockedCardIds.length
      || Object.keys(deepLinkState.spend).length
      || Object.keys(deepLinkState.subcategorySpend).length
      || deepLinkState.k !== 1
      || deepLinkState.valuationMode !== "estimated"
    );

    if (hasDeepLinkValues || deepLinkState.autorun) await actions.hydrateFromDeepLink(deepLinkState);
    elements.appEl.classList.remove("hidden");

    elements.runBtn.addEventListener("click", actions.runOptimizationManually);
    elements.clearSpendBtn?.addEventListener("click", actions.clearSpend);
    elements.kInput.addEventListener("input", () => actions.setK(elements.kInput.value));
    elements.valuationModeEl?.addEventListener("change", () => actions.setValuationMode(elements.valuationModeEl.value));
    elements.includeBusinessCardsEl?.addEventListener("change", () => actions.setIncludeBusinessCards(elements.includeBusinessCardsEl.checked));
    elements.excludeCashbackProgramsEl?.addEventListener("change", () => actions.setExcludeCashbackPrograms(elements.excludeCashbackProgramsEl.checked));
    elements.resetAdvancedPrefsBtn?.addEventListener("click", actions.resetAdvancedPreferences);
    elements.maxAnnualFeeEl?.addEventListener("input", () => actions.setMaxAnnualFee(elements.maxAnnualFeeEl.value));
    elements.chexyFeePercentEl?.addEventListener("input", actions.runOptimization);
    elements.enableLockedCardsEl?.addEventListener("change", actions.toggleLockedCards);

    elements.spendTableEl.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches(spendInputSelector)) return;
      actions.runOptimization();
    });

    elements.spendTableEl.addEventListener("beforeinput", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches(spendInputSelector)) return;
      if (!event.data || !event.inputType.startsWith("insert")) return;
      if (/^\d+$/.test(event.data)) return;
      event.preventDefault();
    });

    elements.lockedCardSearchEl?.addEventListener("input", actions.renderLockedSearchResults);

    elements.lockedCardOptionsEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-card-id]");
      if (!btn) return;
      actions.addLockedCard(btn.dataset.cardId);
    });


    elements.excludedProgramSearchEl?.addEventListener("input", actions.renderExcludedProgramSearchResults);

    elements.excludedProgramOptionsEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-program-id]");
      if (!btn) return;
      actions.addExcludedProgram(btn.dataset.programId);
    });

    elements.excludedProgramPicksEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-program-id]");
      if (!btn) return;
      actions.removeExcludedProgram(btn.dataset.removeProgramId);
    });

    elements.lockedCardPicksEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-id]");
      if (!btn) return;
      actions.removeLockedCard(btn.dataset.removeId);
    });

    window.addEventListener("beforeunload", actions.terminateWorker);
  } catch (e) {
    elements.statusEl.innerHTML = `<span class="badge bad">Error</span> ${escapeHtml(e?.message || "Unknown error")}`;
  }
}

main();
