import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";
import { createOptimizerController } from "./optimizer-controller.js";
import { renderSpendTable, readMonthlySpend, renderIssues, renderResult } from "./ui.js";

const statusEl = document.getElementById("status");
const appEl = document.getElementById("app");
const spendTableEl = document.getElementById("spendTable");
const issuesEl = document.getElementById("issues");

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

    renderSpendTable(spendTableEl, schema, categoryDescriptions);
    renderIssues(issuesEl, issues);

    const issuesWrap = document.getElementById("issuesWrap");
    if (issuesWrap) issuesWrap.classList.toggle("hidden", !issues.length);

    const controller = createOptimizerController({
      eligibleCards,
      programsMap,
      schema,
      elements: {
        runBtn: document.getElementById("runBtn"),
        result: document.getElementById("result"),
        valuationMode: document.getElementById("valuationMode"),
        excludeFeeCards: document.getElementById("excludeFeeCards"),
        enableLockedCards: document.getElementById("enableLockedCards"),
        lockedCardsPanel: document.getElementById("lockedCardsPanel"),
        lockedCardSearch: document.getElementById("lockedCardSearch"),
        lockedCardOptions: document.getElementById("lockedCardOptions"),
        lockedCardPicks: document.getElementById("lockedCardPicks"),
        lockedCardsDivider: document.getElementById("lockedCardsDivider"),
        kInput: document.getElementById("k"),
        kValue: document.getElementById("kValue"),
        kLabel: document.getElementById("kLabel")
      },
      readMonthlySpend: () => readMonthlySpend(schema),
      onResult: ({ best, annualSpend, valuationMode }) => {
        renderResult(document.getElementById("result"), best, annualSpend, schema, valuationMode);
      }
    });

    controller.init();
    appEl.classList.remove("hidden");
  } catch (e) {
    statusEl.innerHTML = `<span class="badge bad">Error</span> ${e.message}`;
  }
}

main();
