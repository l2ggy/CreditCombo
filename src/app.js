import { loadOptimizerData } from "./data-service.js";
import { renderIssues, renderSpendTable } from "./ui.js";
import { createActions } from "./app/actions.js";
import { createUiState } from "./app/state.js";
import { createView } from "./app/view.js";
import { escapeHtml } from "./shared/sanitize.js";


const subcategoryConfigs = {
  grocery: [
    {
      key: "grocery_costco",
      label: "Costco",
      helperText: "Mastercard only.",
      logicAdjustment: "network_category_override",
      acceptedNetworks: ["mastercard"],
      networkCategoryMap: {
        mastercard: "grocery"
      }
    },
    {
      key: "grocery_george_weston",
      label: "Weston brands",
      helperText: "Mastercard/Visa accepted.",
      hoverDetails: "Includes Loblaws, No Frills, Real Canadian Superstore, Maxi, Provigo, Zehrs, and Fortinos.",
      logicAdjustment: "network_category_override",
      acceptedNetworks: ["mastercard", "visa"],
      networkCategoryMap: {
        mastercard: "grocery",
        visa: "grocery"
      }
    },
    {
      key: "grocery_walmart",
      label: "Walmart",
      helperText: "Mastercard: grocery. Visa/Amex: other.",
      logicAdjustment: "network_category_override",
      acceptedNetworks: ["mastercard", "visa", "amex"],
      networkCategoryMap: {
        mastercard: "grocery",
        visa: "other",
        amex: "other"
      }
    }
  ],
  gas: [
    {
      key: "gas_costco",
      label: "Costco gas",
      helperText: "Mastercard only.",
      logicAdjustment: "network_category_override",
      acceptedNetworks: ["mastercard"],
      networkCategoryMap: {
        mastercard: "gas"
      }
    },
    {
      key: "gas_esso_mobil",
      label: "Esso & Mobil",
      helperText: "Merchant multiplier ready.",
      hoverDetails: "Use this for Esso and Mobil spend. This subcategory is ready for merchant or portal earn multipliers."
    }
  ],
  bills: [
    {
      key: "chexy_bills",
      label: "Chexy bills",
      helperText: "Portion of bills spend.",
      feeAdjustment: "chexy"
    }
  ]
};

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

    renderSpendTable(elements.spendTableEl, schema, categoryDescriptions, subcategoryConfigs);
    renderIssues(elements.issuesEl, issues);
    view.syncIssuesVisibility(issues.length);

    const actions = createActions({
      state: createUiState(),
      view,
      schema,
      programsMap,
      eligibleCards,
      eligibleCardIdSet,
      eligibleCardsById,
      subcategoryConfigs
    });

    actions.syncInitialUi();
    elements.appEl.classList.remove("hidden");

    elements.runBtn.addEventListener("click", actions.runOptimization);
    elements.clearSpendBtn?.addEventListener("click", actions.clearSpend);
    elements.kInput.addEventListener("input", () => actions.setK(elements.kInput.value));
    elements.valuationModeEl?.addEventListener("change", () => actions.setValuationMode(elements.valuationModeEl.value));
    elements.includeBusinessCardsEl?.addEventListener("change", () => actions.setIncludeBusinessCards(elements.includeBusinessCardsEl.checked));
    elements.excludeCashbackProgramsEl?.addEventListener("change", () => actions.setExcludeCashbackPrograms(elements.excludeCashbackProgramsEl.checked));
    elements.resetAdvancedPrefsBtn?.addEventListener("click", actions.resetAdvancedPreferences);
    elements.maxAnnualFeeEl?.addEventListener("input", () => actions.setMaxAnnualFee(elements.maxAnnualFeeEl.value));
    elements.chexyFeePercentEl?.addEventListener("input", actions.runOptimization);
    elements.enableLockedCardsEl?.addEventListener("change", actions.toggleLockedCards);

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
