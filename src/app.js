import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";
import { annualizeMonthlySpend, findBestCombo } from "./optimizer.js";
import { clampInt, renderSpendTable, readMonthlySpend, renderIssues, renderResult } from "./ui.js";

const statusEl = document.getElementById("status");
const appEl = document.getElementById("app");
const spendTableEl = document.getElementById("spendTable");
const issuesEl = document.getElementById("issues");
const resultEl = document.getElementById("result");
const runBtn = document.getElementById("runBtn");
const valuationModeEl = document.getElementById("valuationMode");
const excludeFeeCardsEl = document.getElementById("excludeFeeCards");

const kInput = document.getElementById("k");
const kValueEl = document.getElementById("kValue");

async function main() {
  try {
    const [cardsJson, programsJson] = await Promise.all([
      loadJson("./cards.json"),
      loadJson("./programs.json")
    ]);

    const programsMap = normalizePrograms(programsJson);
    const { schema, categoryDescriptions, eligibleCards, issues } = validateAndFilterCards(cardsJson, programsMap);

    statusEl.innerHTML = `
      <span class="badge good">Loaded</span>
      <span class="muted">${eligibleCards.length} eligible cards · ${issues.length} excluded · ${programsMap.size} programs</span>
    `;

    function filteredCards() {
      if (!excludeFeeCardsEl?.checked) return eligibleCards;
      return eligibleCards.filter((card) => Number(card.annual_fee?.amount ?? 0) <= 0);
    }

    function currentMaxSelectableCards(cards) {
      if (!cards.length) return 1;
      return Math.max(1, Math.min(5, cards.length));
    }

    function syncKBounds(cards) {
      const maxSelectableCards = currentMaxSelectableCards(cards);
      kInput.max = String(maxSelectableCards);
      kInput.value = String(clampInt(kInput.value, 1, maxSelectableCards));
      return maxSelectableCards;
    }

    syncKBounds(eligibleCards);

    const comboCache = new Map();

    function updateKValue() {
      if (kValueEl) kValueEl.textContent = String(kInput.value);
    }

    function currentValuationMode() {
      return valuationModeEl?.value === "minimum_guaranteed"
        ? "minimum_guaranteed"
        : "estimated";
    }

    function spendKey(monthlySpend) {
      return schema.map((cat) => `${cat}:${monthlySpend[cat] || 0}`).join("|");
    }

    function getBestCombo(cards, k, annualSpend, valuationMode, monthlySpend) {
      const excludeFeeCards = excludeFeeCardsEl?.checked ? "excludeFee" : "allCards";
      const key = `${spendKey(monthlySpend)}::${valuationMode}::${k}::${excludeFeeCards}`;
      if (comboCache.has(key)) return comboCache.get(key);

      const best = findBestCombo({
        cards,
        programsMap,
        schema,
        k,
        annualSpend,
        valuationMode
      });
      comboCache.set(key, best);
      return best;
    }

    function runOptimizer() {
      runBtn.disabled = true;
      resultEl.classList.add("hidden");
      resultEl.textContent = "Computing…";

      const cardsToConsider = filteredCards();
      const maxSelectableCards = syncKBounds(cardsToConsider);
      const k = clampInt(kInput.value, 1, maxSelectableCards);
      kInput.value = String(k);
      updateKValue();

      if (!cardsToConsider.length) {
        resultEl.classList.remove("hidden");
        resultEl.innerHTML = `<span class="badge bad">No result</span> No cards without annual fees are available for optimization.`;
        runBtn.disabled = false;
        return;
      }

      const valuationMode = currentValuationMode();
      const monthlySpend = readMonthlySpend(schema);
      const hasSpend = schema.some((cat) => (monthlySpend[cat] || 0) > 0);
      if (!hasSpend) {
        resultEl.classList.remove("hidden");
        resultEl.innerHTML = `<span class="muted">Enter monthly spend in at least one category to generate card recommendations.</span>`;
        runBtn.disabled = false;
        return;
      }

      const annualSpend = annualizeMonthlySpend(monthlySpend, schema);
      const best = getBestCombo(cardsToConsider, k, annualSpend, valuationMode, monthlySpend);

      renderResult(resultEl, best, annualSpend, schema, valuationMode);
      runBtn.disabled = false;
    }

    renderSpendTable(spendTableEl, schema, categoryDescriptions);
    renderIssues(issuesEl, issues);
    const issuesWrap = document.getElementById("issuesWrap");
    if (issuesWrap) {
      if (issues.length) issuesWrap.classList.remove("hidden");
      else issuesWrap.classList.add("hidden");
    }

    updateKValue();
    appEl.classList.remove("hidden");

    runBtn.addEventListener("click", runOptimizer);
    kInput.addEventListener("input", runOptimizer);
    valuationModeEl?.addEventListener("change", runOptimizer);
    excludeFeeCardsEl?.addEventListener("change", runOptimizer);

  } catch (e) {
    statusEl.innerHTML = `<span class="badge bad">Error</span> ${e.message}`;
  }
}

main();
