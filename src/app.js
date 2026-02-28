import { loadOptimizerData } from "./data-service.js";
import { renderIssues, renderSpendTable } from "./ui.js";
import { createActions } from "./app/actions.js";
import { createUiState } from "./app/state.js";
import { createView } from "./app/view.js";
import { escapeHtml } from "./shared/sanitize.js";

async function main() {
  const view = createView();
  const { elements } = view;

  try {
    const { schema, categoryDescriptions, eligibleCards, issues, programsMap } = await loadOptimizerData();
    const eligibleCardIdSet = new Set(eligibleCards.map((card) => card.id));
    const eligibleCardsById = new Map(eligibleCards.map((card) => [card.id, card]));

    elements.statusEl.innerHTML = `
      <span class="badge good">Loaded</span>
      <span class="muted">${eligibleCards.length} eligible cards · ${issues.length} excluded · ${programsMap.size} programs</span>
    `;

    renderSpendTable(elements.spendTableEl, schema, categoryDescriptions);
    renderIssues(elements.issuesEl, issues);
    view.syncIssuesVisibility(issues.length);

    const actions = createActions({
      state: createUiState(),
      view,
      schema,
      programsMap,
      eligibleCards,
      eligibleCardIdSet,
      eligibleCardsById
    });

    actions.syncInitialUi();
    elements.appEl.classList.remove("hidden");

    elements.runBtn.addEventListener("click", actions.runOptimization);
    elements.clearSpendBtn?.addEventListener("click", actions.clearSpend);
    elements.kInput.addEventListener("input", () => actions.setK(elements.kInput.value));
    elements.valuationModeEl?.addEventListener("change", () => actions.setValuationMode(elements.valuationModeEl.value));
    elements.excludeBusinessCardsEl?.addEventListener("change", () => actions.setExcludeBusinessCards(elements.excludeBusinessCardsEl.checked));
    elements.excludeCashbackProgramsEl?.addEventListener("change", () => actions.setExcludeCashbackPrograms(elements.excludeCashbackProgramsEl.checked));
    elements.maxAnnualFeeEl?.addEventListener("input", () => actions.setMaxAnnualFee(elements.maxAnnualFeeEl.value));
    elements.enableLockedCardsEl?.addEventListener("change", actions.toggleLockedCards);

    elements.lockedCardSearchEl?.addEventListener("input", actions.renderLockedSearchResults);

    elements.lockedCardOptionsEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-card-id]");
      if (!btn) return;
      actions.addLockedCard(btn.dataset.cardId);
    });


    elements.programPrefsEl?.addEventListener("change", (event) => {
      const excludeInput = event.target.closest("[data-program-exclude]");
      if (!excludeInput) return;
      actions.setProgramExcluded(excludeInput.dataset.programExclude, excludeInput.checked);
    });

    elements.programPrefsEl?.addEventListener("input", (event) => {
      const cppInput = event.target.closest("[data-program-cpp]");
      if (!cppInput) return;
      actions.setProgramCustomCpp(cppInput.dataset.programCpp, cppInput.value);
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
