import { loadOptimizerData } from "./data-service.js";
import { buildOptimizerUrl } from "./app/deeplink.js";

const state = {
  country: "CA",
  goal: "ideal_combo",
  spend: {},
  lockedCardIds: [],
  k: 3,
  creditScore: "",
  annualIncome: "",
  valuationMode: "estimated"
};

const el = {
  stepPanel: document.getElementById("stepPanel"),
  backBtn: document.getElementById("backBtn"),
  nextBtn: document.getElementById("nextBtn"),
  progressText: document.getElementById("progressText"),
  progressFill: document.getElementById("progressFill")
};

const data = await loadOptimizerData();
const cardsById = new Map(data.eligibleCards.map((card) => [card.id, card]));
let stepIndex = 0;

const steps = [
  { key: "country", required: true, render: renderCountry },
  { key: "goal", required: true, render: renderGoal },
  ...data.schema.map((category) => ({ key: `spend:${category}`, required: true, render: () => renderSpendCategory(category) })),
  { key: "cards", required: true, render: renderCards },
  { key: "k", required: true, render: renderK },
  { key: "credit", required: true, render: renderCredit },
  { key: "income", required: true, render: renderIncome },
  { key: "valuation", required: false, render: renderValuation }
];

renderStep();

el.backBtn.addEventListener("click", () => {
  stepIndex = Math.max(0, stepIndex - 1);
  renderStep();
});

el.nextBtn.addEventListener("click", () => {
  if (!validateStep()) return;
  if (stepIndex === steps.length - 1) {
    window.location.href = buildOptimizerUrl(state);
    return;
  }
  stepIndex += 1;
  renderStep();
});

function renderStep() {
  const step = steps[stepIndex];
  el.stepPanel.innerHTML = "";
  step.render();
  el.progressText.textContent = `Question ${stepIndex + 1} of ${steps.length}`;
  el.progressFill.style.width = `${((stepIndex + 1) / steps.length) * 100}%`;
  el.backBtn.disabled = stepIndex === 0;
  el.nextBtn.textContent = stepIndex === steps.length - 1 ? "See recommendations" : "Next";
}

function renderCountry() {
  el.stepPanel.innerHTML = `<h2 class="stepTitle">Where are you applying from?</h2>
    <div class="choiceList"><button class="choiceBtn is-selected" data-country="CA">Canada</button></div>`;
}

function renderGoal() {
  el.stepPanel.innerHTML = `<h2 class="stepTitle">What is your goal?</h2>
    <div class="choiceList">
      <button class="choiceBtn ${state.goal === "ideal_combo" ? "is-selected" : ""}" data-goal="ideal_combo">Optimize ideal combo</button>
      <button class="choiceBtn ${state.goal === "current_cards" ? "is-selected" : ""}" data-goal="current_cards">Optimize currently held cards</button>
    </div>`;
  bindButtons("goal", (value) => { state.goal = value; renderStep(); });
}

function renderSpendCategory(category) {
  const value = state.spend[category] ?? "";
  el.stepPanel.innerHTML = `<h2 class="stepTitle">Monthly spend: ${category}</h2>
    <div class="rowField"><input id="spendInput" type="number" min="0" step="1" value="${value}" placeholder="0" /></div>`;
}

function renderCards() {
  const cardChips = state.lockedCardIds.map((id) => `<span class="chip">${cardsById.get(id)?.card_name || id}</span>`).join(" ") || "No cards selected.";
  el.stepPanel.innerHTML = `<h2 class="stepTitle">Which cards do you currently hold?</h2>
    <input id="cardSearch" type="search" placeholder="Search card name" />
    <div id="cardMatches" class="choiceList"></div>
    <div class="cardPick">${cardChips}</div>`;

  const searchEl = document.getElementById("cardSearch");
  const matchesEl = document.getElementById("cardMatches");
  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    matchesEl.innerHTML = "";
    if (!q) return;
    data.eligibleCards.filter((card) => card.card_name.toLowerCase().includes(q)).slice(0, 8).forEach((card) => {
      const btn = document.createElement("button");
      btn.className = "choiceBtn";
      btn.type = "button";
      btn.textContent = `${card.card_name} (${card.issuer})`;
      btn.addEventListener("click", () => {
        if (!state.lockedCardIds.includes(card.id)) state.lockedCardIds.push(card.id);
        renderStep();
      });
      matchesEl.append(btn);
    });
  });
}

function renderK() {
  const label = state.goal === "current_cards" ? "How many additional cards do you want?" : "How many cards do you want in total?";
  el.stepPanel.innerHTML = `<h2 class="stepTitle">${label}</h2>
    <input id="kInput" type="range" min="1" max="5" value="${state.k}" />
    <p>${state.k} card(s)</p>`;
  const kInput = document.getElementById("kInput");
  kInput.addEventListener("input", () => {
    state.k = Number(kInput.value);
    renderK();
  });
}

function renderCredit() {
  el.stepPanel.innerHTML = `<h2 class="stepTitle">Credit score range</h2>
    <select id="creditInput">
      <option value="">Prefer not to say</option>
      <option value="excellent">Excellent (760+)</option>
      <option value="good">Good (700-759)</option>
      <option value="fair">Fair (640-699)</option>
      <option value="building">Building (&lt;640)</option>
    </select>`;
  document.getElementById("creditInput").value = state.creditScore;
}

function renderIncome() {
  el.stepPanel.innerHTML = `<h2 class="stepTitle">Approximate annual income (optional)</h2>
    <input id="incomeInput" type="number" min="0" step="1000" value="${state.annualIncome}" placeholder="e.g. 85000" />`;
}

function renderValuation() {
  el.stepPanel.innerHTML = `<h2 class="stepTitle">Optional: valuation mode</h2>
    <select id="valuationInput">
      <option value="estimated">Estimated value</option>
      <option value="minimum_guaranteed">Minimum guaranteed value</option>
    </select>`;
  document.getElementById("valuationInput").value = state.valuationMode;
}

function validateStep() {
  const step = steps[stepIndex];
  if (step.key.startsWith("spend:")) {
    const category = step.key.split(":")[1];
    const value = Number(document.getElementById("spendInput")?.value || 0);
    state.spend[category] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  if (step.key === "credit") state.creditScore = document.getElementById("creditInput").value;
  if (step.key === "income") state.annualIncome = document.getElementById("incomeInput").value;
  if (step.key === "valuation") state.valuationMode = document.getElementById("valuationInput").value;
  return true;
}

function bindButtons(dataAttr, onSelect) {
  el.stepPanel.querySelectorAll(`[data-${dataAttr}]`).forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset[dataAttr]));
  });
}
