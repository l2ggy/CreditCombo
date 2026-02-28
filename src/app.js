import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";
import { renderIssues, renderSpendTable } from "./ui.js";
import { createActions } from "./app/actions.js";
import { createUiState } from "./app/state.js";
import { createView } from "./app/view.js";

async function main() {
  const view = createView();
  const { elements } = view;

  try {
    const [cardsJson, programsJson] = await Promise.all([loadJson("./data/cards.json"), loadJson("./data/programs.json")]);

    const programsMap = normalizePrograms(programsJson);
    const { schema, categoryDescriptions, eligibleCards, issues } = validateAndFilterCards(cardsJson, programsMap);
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
    elements.excludeFeeCardsEl?.addEventListener("change", () => actions.setExcludeFeeCards(elements.excludeFeeCardsEl.checked));
    elements.excludeBusinessCardsEl?.addEventListener("change", () => actions.setExcludeBusinessCards(elements.excludeBusinessCardsEl.checked));
    elements.enableLockedCardsEl?.addEventListener("change", actions.toggleLockedCards);

    elements.lockedCardSearchEl?.addEventListener("input", actions.renderLockedSearchResults);

    elements.lockedCardOptionsEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-card-id]");
      if (!btn) return;
      actions.addLockedCard(btn.dataset.cardId);
    });

    elements.lockedCardPicksEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-id]");
      if (!btn) return;
      actions.removeLockedCard(btn.dataset.removeId);
    });

    window.addEventListener("beforeunload", actions.terminateWorker);
  } catch (e) {
    elements.statusEl.innerHTML = `<span class="badge bad">Error</span> ${e.message}`;
  }
}

main();
