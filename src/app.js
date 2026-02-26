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

const kInput = document.getElementById("k");
const kValueInputEl = document.getElementById("kValue");

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

    const maxSelectableCards = Math.max(1, eligibleCards.length);
    kInput.max = String(maxSelectableCards);
    kInput.value = String(clampInt(kInput.value, 1, maxSelectableCards));
    if (kValueInputEl) kValueInputEl.max = String(maxSelectableCards);

    const comboCache = new Map();

    function syncCardCountInputs(rawValue = kInput.value) {
      const k = clampInt(rawValue, 1, maxSelectableCards);
      kInput.value = String(k);
      if (kValueInputEl) kValueInputEl.value = String(k);
      return k;
    }

    function currentValuationMode() {
      return valuationModeEl?.value === "minimum_guaranteed"
        ? "minimum_guaranteed"
        : "estimated";
    }

    function spendKey(monthlySpend) {
      return schema.map((cat) => `${cat}:${monthlySpend[cat] || 0}`).join("|");
    }

    function getBestCombo(k, annualSpend, valuationMode, monthlySpend) {
      const key = `${spendKey(monthlySpend)}::${valuationMode}::${k}`;
      if (comboCache.has(key)) return comboCache.get(key);

      const best = findBestCombo({
        cards: eligibleCards,
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

      const k = syncCardCountInputs(kInput.value);

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
      const best = getBestCombo(k, annualSpend, valuationMode, monthlySpend);

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

    syncCardCountInputs(kInput.value);
    appEl.classList.remove("hidden");

    runBtn.addEventListener("click", runOptimizer);
    kInput.addEventListener("input", runOptimizer);
    kValueInputEl?.addEventListener("change", () => {
      syncCardCountInputs(kValueInputEl.value);
      runOptimizer();
    });
    valuationModeEl?.addEventListener("change", runOptimizer);

  } catch (e) {
    statusEl.innerHTML = `<span class="badge bad">Error</span> ${e.message}`;
  }
}

main();
