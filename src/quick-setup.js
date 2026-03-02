import { loadOptimizerData } from "./data-service.js";
import { buildOptimizerUrl } from "./app/deeplink.js";
import { findCardMatches, renderCardSearchOption } from "./shared/card-search.js";

// TODO(quick-setup-future): add country, credit score, and income questions once
// optimizer constraints support those fields end-to-end.
const state = {
  goal: "ideal_combo",
  spend: {},
  lockedCardIds: [],
  k: 3,
  valuationMode: "estimated"
};

const el = {
  stepPanel: document.getElementById("stepPanel"),
  backBtn: document.getElementById("backBtn"),
  nextBtn: document.getElementById("nextBtn"),
  progressFill: document.getElementById("progressFill"),
  progressText: document.getElementById("progressText")
};

const data = await loadOptimizerData();
const cardsById = new Map(data.eligibleCards.map((card) => [card.id, card]));
let stepIndex = 0;

function getSteps() {
  const spendSteps = data.schema.map((category) => ({ key: `spend:${category}`, render: () => renderSpendCategory(category) }));
  return [
    { key: "goal", render: renderGoal },
    ...spendSteps,
    ...(state.goal === "current_cards" ? [{ key: "cards", render: renderCards }] : []),
    ...(state.goal === "ideal_combo" ? [{ key: "k", render: renderK }] : []),
    { key: "valuation", render: renderValuation }
  ];
}

renderStep();

el.backBtn.addEventListener("click", () => {
  stepIndex = Math.max(0, stepIndex - 1);
  renderStep();
});

el.nextBtn.addEventListener("click", () => {
  if (!validateStep()) return;
  goNext();
});

function goNext() {
  const steps = getSteps();
  if (stepIndex >= steps.length - 1) {
    window.location.href = buildOptimizerUrl(state);
    return;
  }
  stepIndex += 1;
  renderStep();
}

function renderStep() {
  const steps = getSteps();
  if (stepIndex > steps.length - 1) stepIndex = steps.length - 1;
  const step = steps[stepIndex];
  el.stepPanel.innerHTML = "";
  step.render();

  const progress = ((stepIndex + 1) / steps.length) * 100;
  el.progressFill.style.width = `${progress}%`;
  const progressBar = document.querySelector(".progressBar");
  progressBar?.setAttribute("aria-valuenow", String(Math.round(progress)));
  if (el.progressText) el.progressText.textContent = `${Math.round(progress)}% complete`;

  el.backBtn.disabled = stepIndex === 0;
  el.nextBtn.textContent = stepIndex === steps.length - 1 ? "See recommendations" : "Next";
}

function renderGoal() {
  el.stepPanel.innerHTML = `
    <h2 class="stepTitle">What are you trying to do today?</h2>
    <p class="stepHelp">Pick one to start.</p>
    <div class="choiceList">
      <button class="choiceBtn ${state.goal === "ideal_combo" ? "is-selected" : ""}" data-goal="ideal_combo" type="button">
        Find me the best possible CreditCombo
      </button>
      <button class="choiceBtn ${state.goal === "current_cards" ? "is-selected" : ""}" data-goal="current_cards" type="button">
        Help me use my current cards better
      </button>
    </div>
  `;

  bindButtons("goal", (goal) => {
    state.goal = goal;
    if (goal === "current_cards") state.k = 0;
    else if (state.k < 1) state.k = 1;
    goNext();
  });
}

function renderSpendCategory(category) {
  const value = state.spend[category] ?? "";
  el.stepPanel.innerHTML = `
    <h2 class="stepTitle">What is your monthly spend on ${category.toLowerCase()}?</h2>
    <p class="stepHelp">Enter an average monthly amount in CAD.</p>
    <input id="spendInput" class="bigInput" type="number" min="0" step="1" value="${value}" placeholder="0" />
  `;

  const spendInput = document.getElementById("spendInput");
  requestAnimationFrame(() => {
    spendInput?.focus();
    spendInput?.select();
  });
  spendInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!validateStep()) return;
    goNext();
  });
}

function renderCards() {
  const cardChips = state.lockedCardIds.map((id) => `<span class="chip">${cardsById.get(id)?.card_name || id}</span>`).join(" ") || "No cards selected yet.";

  el.stepPanel.innerHTML = `
    <h2 class="stepTitle">Which cards do you have right now?</h2>
    <p class="stepHelp">Add the cards you currently have. We will optimize usage with these cards only.</p>
    <input id="cardSearch" class="bigInput" type="search" placeholder="Type a card or issuer name" />
    <div id="cardMatches" class="choiceList"></div>
    <div class="cardPick">${cardChips}</div>
  `;

  const searchEl = document.getElementById("cardSearch");
  const matchesEl = document.getElementById("cardMatches");
  requestAnimationFrame(() => searchEl?.focus());

  searchEl.addEventListener("input", () => {
    const matches = findCardMatches(data.eligibleCards, searchEl.value || "", {
      excludedIds: new Set(state.lockedCardIds),
      limit: 8
    });

    matchesEl.innerHTML = "";
    if (!matches.length) return;

    const fragment = document.createDocumentFragment();
    matches.forEach((card) => {
      fragment.append(renderCardSearchOption(card, {
        className: "choiceBtn quickSearchOption",
        thumbClassName: "thumb thumb-sm thumb-contain",
        thumbWithFrame: true,
        thumbFrameClass: "quickThumbWrap",
        ariaPrefix: "Add card"
      }));
    });

    matchesEl.append(fragment);
  });

  matchesEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-card-id]");
    if (!btn) return;
    if (!state.lockedCardIds.includes(btn.dataset.cardId)) state.lockedCardIds.push(btn.dataset.cardId);
    renderStep();
  });
}

function renderK() {
  el.stepPanel.innerHTML = `
    <h2 class="stepTitle">How many cards do you want in your combo?</h2>
    <p class="stepHelp">Move the slider to choose your target combo size.</p>
    <label for="kInput"><span>Number of cards</span> <span id="kValue" class="value-pill">${state.k}</span></label>
    <input id="kInput" type="range" min="1" max="5" value="${state.k}" step="1" />
  `;

  const kInput = document.getElementById("kInput");
  const kValueEl = document.getElementById("kValue");
  kInput.addEventListener("input", () => {
    state.k = Number(kInput.value);
    if (kValueEl) kValueEl.textContent = String(state.k);
  });
}

function renderValuation() {
  el.stepPanel.innerHTML = `
    <h2 class="stepTitle">How should we value your rewards?</h2>
    <p class="stepHelp">You can change this later on the main optimizer page.</p>
    <select id="valuationInput" class="bigInput">
      <option value="estimated">Estimated value</option>
      <option value="minimum_guaranteed">Minimum guaranteed value</option>
    </select>
  `;
  document.getElementById("valuationInput").value = state.valuationMode;
}

function validateStep() {
  const step = getSteps()[stepIndex];
  if (step.key.startsWith("spend:")) {
    const category = step.key.split(":")[1];
    const value = Number(document.getElementById("spendInput")?.value || 0);
    state.spend[category] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  if (step.key === "valuation") {
    state.valuationMode = document.getElementById("valuationInput")?.value || "estimated";
  }
  if (step.key === "k") {
    state.k = Math.max(1, Number(document.getElementById("kInput")?.value || state.k || 1));
  }
  if (state.goal === "current_cards") state.k = 0;
  return true;
}

function bindButtons(dataAttr, onSelect) {
  el.stepPanel.querySelectorAll(`[data-${dataAttr}]`).forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset[dataAttr]));
  });
}
