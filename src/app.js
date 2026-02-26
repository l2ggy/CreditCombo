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
const lockedCardsEl = document.getElementById("lockedCards");

const kInput = document.getElementById("k");
const kValueEl = document.getElementById("kValue");

async function main() {
  try {
    const [cardsJson, programsJson] = await Promise.all([
      loadJson("./data/cards.json"),
      loadJson("./data/programs.json")
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

    function selectedLockedCardIds(cardsToConsider) {
      if (!lockedCardsEl) return [];
      const selectableIds = new Set(cardsToConsider.map((card) => card.id));
      return [...lockedCardsEl.selectedOptions]
        .map((opt) => opt.value)
        .filter((id) => selectableIds.has(id));
    }

    function currentMaxAdditionalCards(cards) {
      const lockedCount = selectedLockedCardIds(cards).length;
      return Math.max(0, Math.min(5, cards.length - lockedCount));
    }

    function syncKBounds(cards) {
      const maxAdditionalCards = currentMaxAdditionalCards(cards);
      kInput.min = "0";
      kInput.max = String(maxAdditionalCards);
      kInput.value = String(clampInt(kInput.value, 0, maxAdditionalCards));
      return maxAdditionalCards;
    }

    function renderLockedCardOptions(cardsToConsider) {
      if (!lockedCardsEl) return;
      const previousSelection = new Set(selectedLockedCardIds(cardsToConsider));
      lockedCardsEl.innerHTML = cardsToConsider
        .map((card) => `<option value="${card.id}">${card.card_name} (${card.issuer})</option>`)
        .join("");

      for (const opt of lockedCardsEl.options) {
        if (previousSelection.has(opt.value)) opt.selected = true;
      }
    }

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

    function getBestCombo(cards, k, annualSpend, valuationMode, monthlySpend, lockedCardIds) {
      const excludeFeeCards = excludeFeeCardsEl?.checked ? "excludeFee" : "allCards";
      const lockKey = [...lockedCardIds].sort().join(",");
      const key = `${spendKey(monthlySpend)}::${valuationMode}::${k}::${excludeFeeCards}::${lockKey}`;
      if (comboCache.has(key)) return comboCache.get(key);

      const best = findBestCombo({
        cards,
        programsMap,
        schema,
        k,
        annualSpend,
        valuationMode,
        lockedCardIds
      });
      comboCache.set(key, best);
      return best;
    }

    function runOptimizer() {
      runBtn.disabled = true;
      resultEl.classList.add("hidden");
      resultEl.textContent = "Computing…";

      const cardsToConsider = filteredCards();
      renderLockedCardOptions(cardsToConsider);
      const lockedCardIds = selectedLockedCardIds(cardsToConsider);

      const maxAdditionalCards = syncKBounds(cardsToConsider);
      const k = clampInt(kInput.value, 0, maxAdditionalCards);
      kInput.value = String(k);
      updateKValue();

      if (!cardsToConsider.length) {
        resultEl.classList.remove("hidden");
        resultEl.innerHTML = `<span class="badge bad">No result</span> No cards without annual fees are available for optimization.`;
        runBtn.disabled = false;
        return;
      }

      if (!lockedCardIds.length && k === 0) {
        resultEl.classList.remove("hidden");
        resultEl.innerHTML = `<span class="muted">Choose at least one locked card or increase additional cards above 0.</span>`;
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
      const best = getBestCombo(cardsToConsider, k, annualSpend, valuationMode, monthlySpend, lockedCardIds);

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

    renderLockedCardOptions(filteredCards());
    syncKBounds(filteredCards());
    updateKValue();
    appEl.classList.remove("hidden");

    runBtn.addEventListener("click", runOptimizer);
    kInput.addEventListener("input", runOptimizer);
    valuationModeEl?.addEventListener("change", runOptimizer);
    excludeFeeCardsEl?.addEventListener("change", runOptimizer);
    lockedCardsEl?.addEventListener("change", runOptimizer);

  } catch (e) {
    statusEl.innerHTML = `<span class="badge bad">Error</span> ${e.message}`;
  }
}

main();
