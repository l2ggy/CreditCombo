import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";
import { annualizeMonthlySpend, findBestCombo } from "./optimizer.js";
import { clampInt, renderSpendTable, readMonthlySpend, renderIssues, renderResult, renderCardCatalog } from "./ui.js";

const statusEl = document.getElementById("status");
const appEl = document.getElementById("app");
const spendTableEl = document.getElementById("spendTable");
const issuesEl = document.getElementById("issues");
const resultEl = document.getElementById("result");
const cardCatalogEl = document.getElementById("cardCatalog");
const runBtn = document.getElementById("runBtn");

const kInput = document.getElementById("k");

async function main() {
  try {
    const [cardsJson, programsJson] = await Promise.all([
      loadJson("./cards.json"),
      loadJson("./programs.json")
    ]);

    const programsMap = normalizePrograms(programsJson);
    const { schema, eligibleCards, issues } = validateAndFilterCards(cardsJson, programsMap);

    statusEl.innerHTML = `
      <span class="badge good">Loaded</span>
      <span class="muted">${eligibleCards.length} eligible cards · ${issues.length} excluded · ${programsMap.size} programs</span>
    `;

    renderSpendTable(spendTableEl, schema);
    renderIssues(issuesEl, issues);
    renderCardCatalog(cardCatalogEl, eligibleCards, schema);
    const issuesWrap = document.getElementById("issuesWrap");
    if (issuesWrap) {
      if (issues.length) issuesWrap.classList.remove("hidden");
      else issuesWrap.classList.add("hidden");
    }

    appEl.classList.remove("hidden");

    runBtn.addEventListener("click", () => {
      runBtn.disabled = true;
      resultEl.classList.add("hidden");
      resultEl.textContent = "Computing…";

      const k = clampInt(kInput.value, 1, 5);
      const monthlySpend = readMonthlySpend(schema);
      const annualSpend = annualizeMonthlySpend(monthlySpend, schema);

      const best = findBestCombo({
        cards: eligibleCards,
        programsMap,
        schema,
        k,
        annualSpend
      });

      renderResult(resultEl, best, annualSpend, schema);
      runBtn.disabled = false;
    });

  } catch (e) {
    statusEl.innerHTML = `<span class="badge bad">Error</span> ${e.message}`;
  }
}

main();
