import { loadOptimizerData } from "./data-service.js";
import { buildOptimizerDeepLink } from "./app/deeplink.js";
import { bindCardSearchKeyboard, createCardSearchIndex, rankCardMatches, renderCardSearchOptions } from "./shared/card-search.js";

const appEl = document.getElementById("quickSetupApp");

const state = {
  mode: null,
  monthlySpend: {},
  subcategorySpend: {},
  lockedCardIds: [],
  k: 1,
  valuationMode: "estimated"
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
        <div class="quickGoalGrid">
          <button type="button" class="quickGoalBtn" data-mode="ideal_combo">Find me the best possible CreditCombo</button>
          <button type="button" class="quickGoalBtn" data-mode="current_cards">Help me use my current cards better</button>
        </div>
      `;

      contentEl.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.mode = btn.dataset.mode;
          contentEl.querySelectorAll("[data-mode]").forEach((node) => node.classList.toggle("is-selected", node === btn));
          if (state.mode === "current_cards") state.k = 0;
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
        <input id="quickSpendInput" type="number" min="0" step="1" value="${value}" placeholder="0" />
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
          <input id="quickCardSearch" type="search" placeholder="Type card or issuer name" autocomplete="off" />
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
        state.lockedCardIds.forEach((id) => {
          const card = ctx.eligibleCardsById.get(id);
          if (!card) return;
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = card.card_name;
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "chipRemove";
          remove.textContent = "×";
          remove.addEventListener("click", () => {
            state.lockedCardIds = state.lockedCardIds.filter((value) => value !== id);
            renderPicks();
            input.dispatchEvent(new Event("input"));
          });
          chip.append(" ", remove);
          picksEl.append(chip);
        });
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

      input.addEventListener("input", renderMatches);
      const addCard = (cardId) => {
        if (!cardId || state.lockedCardIds.includes(cardId)) return;
        state.lockedCardIds.push(cardId);
        input.value = "";
        renderPicks();
        renderMatches();
      };

      optionsEl.addEventListener("click", (event) => {
        const button = event.target.closest("[data-card-id]");
        if (!button) return;
        addCard(button.dataset.cardId);
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
      const max = 5;
      const value = Number.isFinite(state.k) ? state.k : 1;
      contentEl.innerHTML = `
        <h2 class="quickPrompt">How many cards do you want in your setup?</h2>
        <label for="quickK">Number of cards <span id="quickKValue" class="value-pill">${value}</span></label>
        <input id="quickK" type="range" min="0" max="${max}" step="1" value="${value}" />
      `;

      const input = contentEl.querySelector("#quickK");
      const valueEl = contentEl.querySelector("#quickKValue");
      const sync = () => {
        state.k = Number(input.value);
        valueEl.textContent = input.value;
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
        <h2 class="quickPrompt">How should we value rewards?</h2>
        <select id="quickValuation">
          <option value="estimated" ${state.valuationMode === "estimated" ? "selected" : ""}>Estimated value</option>
          <option value="minimum_guaranteed" ${state.valuationMode === "minimum_guaranteed" ? "selected" : ""}>Minimum guaranteed value</option>
        </select>
      `;
      const select = contentEl.querySelector("#quickValuation");
      select.addEventListener("change", () => {
        state.valuationMode = select.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
      });
      return {};
    },
    validate: () => true
  };
}

function buildSteps() {
  if (!state.mode) return [stepGoal()];
  const spendSteps = ctx.schema.map((cat) => stepSpend(cat));
  const shared = [stepGoal(), ...spendSteps, stepValuation()];
  if (state.mode === "current_cards") return [...shared, stepCurrentCards()];
  return [...shared, stepK()];
}

function refreshStepPlan() {
  visibleSteps = buildSteps();
  currentStepIndex = Math.min(currentStepIndex, visibleSteps.length - 1);
}

function updateProgress(rootEl) {
  const progressNow = currentStepIndex + 1;
  const progressMax = visibleSteps.length;
  const bar = rootEl.querySelector("#quickProgressBar");
  const percent = Math.round((progressNow / progressMax) * 100);
  bar.style.width = `${percent}%`;
  rootEl.querySelector("#quickProgress").setAttribute("aria-valuenow", String(progressNow));
  rootEl.querySelector("#quickProgress").setAttribute("aria-valuemax", String(progressMax));
}

function goNext() {
  const step = visibleSteps[currentStepIndex];
  if (!step.validate()) return;
  if (currentStepIndex >= visibleSteps.length - 1) {
    if (state.mode === "current_cards") state.k = 0;
    // TODO: add country capture once country-based card eligibility is implemented.
    // TODO: add credit score gating once credit-tier constraints are supported.
    // TODO: add income-based filtering once card income requirements are integrated.
    const url = buildOptimizerDeepLink(state);
    window.location.assign(url);
    return;
  }
  currentStepIndex += 1;
  renderWizard();
}

function goBack() {
  if (currentStepIndex === 0) return;
  currentStepIndex -= 1;
  renderWizard();
}

function renderWizard() {
  const step = visibleSteps[currentStepIndex];

  appEl.innerHTML = `
    <div id="quickProgress" class="quickProgress" role="progressbar" aria-valuemin="1"><div id="quickProgressBar" class="quickProgressBar"></div></div>
    <div id="quickContent"></div>
    <div class="quickActions">
      <button type="button" id="quickBack">Back</button>
      <button type="button" id="quickNext" class="primary">Next</button>
    </div>
  `;

  updateProgress(appEl);

  const contentEl = appEl.querySelector("#quickContent");
  const { beforeNext = null, autoAdvance = false } = step.render(contentEl) || {};

  const backBtn = appEl.querySelector("#quickBack");
  const nextBtn = appEl.querySelector("#quickNext");

  if (currentStepIndex === 0 || autoAdvance) backBtn.classList.add("hidden");
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
