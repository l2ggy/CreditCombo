import { loadOptimizerData } from "./data-service.js";
import { buildOptimizerDeepLink } from "./app/deeplink.js";
import { renderLockedChip } from "./shared/render.js";
import { bindCardSearchKeyboard, createCardSearchIndex, rankCardMatches, renderCardSearchOptions } from "./shared/card-search.js";

const appEl = document.getElementById("quickSetupApp");

const state = {
  mode: null,
  monthlySpend: {},
  subcategorySpend: {},
  lockedCardIds: [],
  k: 1,
  valuationMode: null
};

let ctx = null;
let visibleSteps = [];
let currentStepIndex = 0;

function titleForCategory(cat) {
  return String(cat).replace(/_/g, " ");
}

function stepGoal() {
  return {
    key: "goal",
    render(contentEl) {
      contentEl.innerHTML = `
        <h2 class="quickPrompt">What are you trying to do today?</h2>
        <p class="quickLead">Pick one option to continue.</p>
        <div class="quickGoalGrid">
          <button type="button" class="quickGoalBtn" data-mode="ideal_combo">Find me the best possible CreditCombo</button>
          <button type="button" class="quickGoalBtn" data-mode="current_cards">Help me use my current cards better</button>
        </div>
      `;

      contentEl.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.mode = btn.dataset.mode;
          contentEl.querySelectorAll("[data-mode]").forEach((node) => node.classList.toggle("is-selected", node === btn));
          state.k = state.mode === "current_cards" ? 0 : Math.max(1, Number(state.k) || 1);
          refreshStepPlan();
          goNext();
        });
      });

      return { autoAdvance: true };
    },
    validate: () => Boolean(state.mode)
  };
}

function stepSpend(cat) {
  return {
    key: `spend_${cat}`,
    render(contentEl) {
      const value = state.monthlySpend[cat] ?? "";
      contentEl.innerHTML = `
        <h2 class="quickPrompt">What is your monthly spend on ${titleForCategory(cat)}?</h2>
        <input id="quickSpendInput" class="quickBigInput" type="number" min="0" step="1" value="${value}" placeholder="0" />
      `;

      const input = contentEl.querySelector("#quickSpendInput");
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);

      const save = () => {
        const amount = Number(input.value);
        state.monthlySpend[cat] = Number.isFinite(amount) && amount >= 0 ? amount : 0;
      };

      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        save();
        goNext();
      });

      return { beforeNext: save };
    },
    validate: () => true
  };
}

function stepCurrentCards() {
  return {
    key: "current_cards",
    render(contentEl) {
      const searchIndex = createCardSearchIndex(ctx.eligibleCards);

      contentEl.innerHTML = `
        <h2 class="quickPrompt">Which cards do you already have?</h2>
        <div class="quickSearch">
          <input id="quickCardSearch" class="quickBigInput" type="search" placeholder="Type card or issuer name" autocomplete="off" />
          <div id="quickCardOptions" class="listBox hidden" role="listbox" aria-label="Matching cards"></div>
          <div id="quickCardPicks" class="chipList muted"></div>
        </div>
      `;

      const input = contentEl.querySelector("#quickCardSearch");
      const optionsEl = contentEl.querySelector("#quickCardOptions");
      const picksEl = contentEl.querySelector("#quickCardPicks");

      const renderPicks = () => {
        picksEl.innerHTML = "";
        if (!state.lockedCardIds.length) {
          picksEl.textContent = "No cards selected yet.";
          return;
        }

        const frag = document.createDocumentFragment();
        state.lockedCardIds.forEach((id, index) => {
          const card = ctx.eligibleCardsById.get(id);
          if (!card) return;
          const chip = renderLockedChip(card);
          frag.append(chip);
          if (index < state.lockedCardIds.length - 1) frag.append(" ");
        });
        picksEl.append(frag);
      };

      const renderMatches = () => {
        const matches = rankCardMatches(searchIndex, input.value || "", {
          excludeCardIds: new Set(state.lockedCardIds),
          limit: 8
        });

        if (!matches.length) {
          optionsEl.classList.add("hidden");
          optionsEl.innerHTML = "";
          return;
        }

        optionsEl.classList.remove("hidden");
        renderCardSearchOptions(optionsEl, matches, {
          thumbClass: "thumb thumb-sm thumb-contain",
          dataAttribute: "cardId",
          getAriaLabel: (card) => `Add ${card.card_name}`
        });
      };

      const addCard = (cardId) => {
        if (!cardId || state.lockedCardIds.includes(cardId)) return;
        state.lockedCardIds.push(cardId);
        state.k = 0;
        input.value = "";
        renderPicks();
        renderMatches();
      };

      input.addEventListener("input", renderMatches);
      optionsEl.addEventListener("click", (event) => {
        const button = event.target.closest("[data-card-id]");
        if (!button) return;
        addCard(button.dataset.cardId);
      });

      picksEl.addEventListener("click", (event) => {
        const removeBtn = event.target.closest("[data-remove-id]");
        if (!removeBtn) return;
        state.lockedCardIds = state.lockedCardIds.filter((id) => id !== removeBtn.dataset.removeId);
        renderPicks();
        renderMatches();
      });

      bindCardSearchKeyboard(input, optionsEl, addCard);
      renderPicks();
      input.focus();
      return {};
    },
    validate: () => true
  };
}

function stepK() {
  return {
    key: "k",
    render(contentEl) {
      const value = Number.isFinite(state.k) ? Math.max(0, state.k) : 1;
      contentEl.innerHTML = `
        <h2 class="quickPrompt">How many cards do you want in your setup?</h2>
        <label class="quickLabel" for="quickK">Number of cards <span id="quickKValue" class="value-pill">${value}</span></label>
        <input id="quickK" type="range" min="0" max="5" step="1" value="${value}" />
      `;

      const input = contentEl.querySelector("#quickK");
      const valueEl = contentEl.querySelector("#quickKValue");
      const sync = () => {
        state.k = Math.max(0, Number(input.value) || 0);
        valueEl.textContent = String(state.k);
      };

      input.addEventListener("input", sync);
      sync();
      return {};
    },
    validate: () => Number.isFinite(state.k)
  };
}

function stepValuation() {
  return {
    key: "valuation",
    render(contentEl) {
      contentEl.innerHTML = `
        <h2 class="quickPrompt">How do you usually redeem rewards?</h2>
        <p class="quickLead">Pick the option that sounds most like you.</p>
        <p class="quickHint">Choose one option to continue.</p>
        <div class="quickGoalGrid">
          <button type="button" class="quickGoalBtn ${state.valuationMode === "estimated" ? "is-selected" : ""}" data-valuation="estimated" aria-pressed="false">
            I look for great travel redemptions (higher upside)
          </button>
          <button type="button" class="quickGoalBtn ${state.valuationMode === "minimum_guaranteed" ? "is-selected" : ""}" data-valuation="minimum_guaranteed" aria-pressed="false">
            I prefer statement credit / guaranteed value
          </button>
        </div>
      `;

      const valuationButtons = [...contentEl.querySelectorAll("[data-valuation]")];
      const syncPressedState = () => {
        valuationButtons.forEach((node) => {
          const selected = node.dataset.valuation === state.valuationMode;
          node.classList.toggle("is-selected", selected);
          node.setAttribute("aria-pressed", String(selected));
        });
      };

      valuationButtons.forEach((button) => {
        button.addEventListener("click", () => {
          state.valuationMode = button.dataset.valuation === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
          syncPressedState();
          goNext();
        });
      });

      syncPressedState();
      return { autoAdvance: true };
    },
    validate: () => Boolean(state.valuationMode)
  };
}

function buildSteps() {
  if (!state.mode) return [stepGoal()];
  const spendSteps = ctx.schema.map((cat) => stepSpend(cat));
  const requiredSteps = [stepGoal(), ...spendSteps];
  if (state.mode === "current_cards") return [...requiredSteps, stepCurrentCards(), stepValuation()];
  return [...requiredSteps, stepK(), stepValuation()];
}

function getProgressBounds() {
  const maxFlow = ctx.schema.length + 3;
  return { min: 1, max: maxFlow };
}

function refreshStepPlan() {
  visibleSteps = buildSteps();
  currentStepIndex = Math.min(currentStepIndex, visibleSteps.length - 1);
}

function updateProgress() {
  const { max } = getProgressBounds();
  const progressNow = Math.min(max, currentStepIndex + 1);
  const percent = Math.round((progressNow / max) * 100);

  const root = appEl.querySelector("#quickProgress");
  const bar = appEl.querySelector("#quickProgressBar");
  bar.style.width = `${percent}%`;
  root.setAttribute("aria-valuenow", String(progressNow));
  root.setAttribute("aria-valuemin", "1");
  root.setAttribute("aria-valuemax", String(max));
}

function goNext() {
  const step = visibleSteps[currentStepIndex];
  if (!step?.validate()) return;

  if (currentStepIndex >= visibleSteps.length - 1) {
    if (state.mode === "current_cards") state.k = 0;
    // TODO: add country capture once country-based card eligibility is implemented.
    // TODO: add credit score gating once credit-tier constraints are supported.
    // TODO: add income-based filtering once card income requirements are integrated.
    window.location.assign(buildOptimizerDeepLink({ ...state, valuationMode: state.valuationMode || "estimated" }));
    return;
  }

  currentStepIndex += 1;
  renderWizard();
}

function goBack() {
  if (currentStepIndex <= 0) return;
  currentStepIndex -= 1;
  renderWizard();
}

function renderWizard() {
  const step = visibleSteps[currentStepIndex];

  appEl.innerHTML = `
    <div id="quickProgress" class="quickProgress" role="progressbar">
      <div id="quickProgressBar" class="quickProgressBar"></div>
    </div>
    <div id="quickContent" class="quickContent"></div>
    <div class="quickActions">
      <button type="button" id="quickBack">Back</button>
      <button type="button" id="quickNext" class="primary">Next</button>
    </div>
  `;

  updateProgress();

  const contentEl = appEl.querySelector("#quickContent");
  const { beforeNext = null, autoAdvance = false } = step.render(contentEl) || {};

  const backBtn = appEl.querySelector("#quickBack");
  const nextBtn = appEl.querySelector("#quickNext");

  if (currentStepIndex === 0) backBtn.classList.add("hidden");
  backBtn.addEventListener("click", goBack);

  nextBtn.addEventListener("click", () => {
    if (typeof beforeNext === "function") beforeNext();
    goNext();
  });

  if (autoAdvance) nextBtn.classList.add("hidden");
}

async function main() {
  const data = await loadOptimizerData();
  ctx = {
    ...data,
    eligibleCardsById: new Map(data.eligibleCards.map((card) => [card.id, card]))
  };

  refreshStepPlan();
  renderWizard();
}

main();
