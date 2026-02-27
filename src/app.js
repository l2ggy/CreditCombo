import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";
import { createOptimizerController } from "./optimizer-controller.js";
import { clampInt, renderSpendTable, readMonthlySpend, renderIssues, renderResult } from "./ui.js";

const statusEl = document.getElementById("status");
const appEl = document.getElementById("app");
const spendTableEl = document.getElementById("spendTable");
const clearSpendBtn = document.getElementById("clearSpendBtn");
const issuesEl = document.getElementById("issues");
const resultEl = document.getElementById("result");
const runBtn = document.getElementById("runBtn");
const valuationModeEl = document.getElementById("valuationMode");
const excludeFeeCardsEl = document.getElementById("excludeFeeCards");
const excludeBusinessCardsEl = document.getElementById("excludeBusinessCards");
const enableLockedCardsEl = document.getElementById("enableLockedCards");
const lockedCardsPanelEl = document.getElementById("lockedCardsPanel");
const lockedCardSearchEl = document.getElementById("lockedCardSearch");
const lockedCardOptionsEl = document.getElementById("lockedCardOptions");
const lockedCardPicksEl = document.getElementById("lockedCardPicks");
const lockedCardsDividerEl = document.getElementById("lockedCardsDivider");

const kInput = document.getElementById("k");
const kValueEl = document.getElementById("kValue");
const kLabelEl = document.getElementById("kLabel");

async function main() {
  try {
    const [cardsJson, programsJson] = await Promise.all([
      loadJson("./data/cards.json"),
      loadJson("./data/programs.json")
    ]);

    const programsMap = normalizePrograms(programsJson);
    const { schema, categoryDescriptions, eligibleCards, issues } = validateAndFilterCards(cardsJson, programsMap);
    const eligibleCardsById = new Map(eligibleCards.map((card) => [card.id, card]));
    const controller = createOptimizerController({ cards: eligibleCards, programsMap, schema });

    statusEl.innerHTML = `<span class="badge good">Loaded</span><span class="muted">${eligibleCards.length} eligible cards · ${issues.length} excluded · ${programsMap.size} programs</span>`;

    const lockedCardIds = new Set();

    function selectedLockedCardIds() {
      return controller.normalizeManualIds([...lockedCardIds]);
    }

    function updateKValue() {
      kValueEl.textContent = String(kInput.value);
    }

    function updateSliderLabel() {
      kLabelEl.textContent = enableLockedCardsEl?.checked ? "Additional cards" : "Number of cards";
    }

    function currentMaxTarget() {
      const manualEnabled = Boolean(enableLockedCardsEl?.checked);
      const selectedCount = manualEnabled ? selectedLockedCardIds().length : 0;
      const result = controller.run({
        monthlySpend: {},
        targetCardCount: manualEnabled ? Number(kInput.value || 0) : 0,
        targetMode: manualEnabled ? "additional" : "total",
        manualCardIds: selectedLockedCardIds(),
        manualEnabled,
        excludeFeeCards: Boolean(excludeFeeCardsEl?.checked),
        excludeBusinessCards: Boolean(excludeBusinessCardsEl?.checked)
      });
      return manualEnabled ? result.maxAdditionalCards : result.maxAdditionalCards + selectedCount;
    }

    function syncKBounds() {
      const maxTarget = Math.max(0, Math.min(5, currentMaxTarget()));
      const minValue = enableLockedCardsEl?.checked ? 0 : (maxTarget > 0 ? 1 : 0);
      kInput.min = String(minValue);
      kInput.max = String(maxTarget);
      kInput.value = String(clampInt(kInput.value, minValue, maxTarget));
      updateKValue();
    }

    function lockedCardThumbMarkup(card, className = "lockedCardThumb") {
      return `<img class="${className}" src="./assets/cards/${escapeHtml(card.id)}.webp" alt="${escapeHtml(card.card_name)}" loading="lazy" decoding="async" onerror="this.remove()" />`;
    }

    function renderLockedCardPicks() {
      const ids = selectedLockedCardIds();
      if (!ids.length) {
        lockedCardPicksEl.innerHTML = "No locked cards selected.";
        return;
      }

      lockedCardPicksEl.innerHTML = ids.map((id) => {
        const card = eligibleCardsById.get(id);
        const label = card ? `${card.card_name} (${card.issuer})` : id;
        return `<span class="lockedChip">${card ? lockedCardThumbMarkup(card) : ""}<span>${escapeHtml(label)}</span> <button type="button" class="lockedChipRemove" data-remove-id="${id}" aria-label="Remove ${escapeHtml(label)}">×</button></span>`;
      }).join(" ");
    }

    function searchMatches(query) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return eligibleCards
        .filter((card) => !lockedCardIds.has(card.id))
        .filter((card) => `${card.card_name} ${card.issuer} ${card.network}`.toLowerCase().includes(q))
        .slice(0, 10);
    }

    function renderLockedSearchResults() {
      const matches = searchMatches(lockedCardSearchEl.value || "");
      if (!matches.length) {
        lockedCardOptionsEl.classList.add("hidden");
        lockedCardOptionsEl.innerHTML = "";
        return;
      }

      lockedCardOptionsEl.classList.remove("hidden");
      lockedCardOptionsEl.innerHTML = matches
        .map((card) => `<button type="button" class="lockedOption" data-card-id="${card.id}">${lockedCardThumbMarkup(card)}<span>${escapeHtml(card.card_name)} <span class="muted">(${escapeHtml(card.issuer)})</span></span></button>`)
        .join("");
    }

    function updateLockedCardsUi() {
      for (const id of [...lockedCardIds]) {
        if (!eligibleCardsById.has(id)) lockedCardIds.delete(id);
      }

      const enabled = Boolean(enableLockedCardsEl?.checked);
      lockedCardsPanelEl?.classList.toggle("hidden", !enabled);
      lockedCardsDividerEl?.classList.toggle("hidden", !enabled);
      if (!enabled) {
        lockedCardSearchEl.value = "";
        lockedCardOptionsEl.classList.add("hidden");
        lockedCardOptionsEl.innerHTML = "";
      }

      renderLockedCardPicks();
      renderLockedSearchResults();
      updateSliderLabel();
      syncKBounds();
    }

    function runOptimizer() {
      runBtn.disabled = true;
      resultEl.classList.add("hidden");
      resultEl.textContent = "Computing…";

      updateLockedCardsUi();

      const monthlySpend = readMonthlySpend(schema);
      const hasSpend = schema.some((cat) => (monthlySpend[cat] || 0) > 0);
      if (!hasSpend) {
        resultEl.classList.remove("hidden");
        resultEl.innerHTML = `<span class="muted">Enter monthly spend in at least one category to generate card recommendations.</span>`;
        runBtn.disabled = false;
        return;
      }

      const manualEnabled = Boolean(enableLockedCardsEl?.checked);
      const targetMode = manualEnabled ? "additional" : "total";
      const targetCount = clampInt(kInput.value, Number(kInput.min), Number(kInput.max));
      kInput.value = String(targetCount);
      updateKValue();

      const { best, annualSpend } = controller.run({
        monthlySpend,
        valuationMode: valuationModeEl?.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated",
        targetCardCount: targetCount,
        targetMode,
        manualCardIds: selectedLockedCardIds(),
        manualEnabled,
        excludeFeeCards: Boolean(excludeFeeCardsEl?.checked),
        excludeBusinessCards: Boolean(excludeBusinessCardsEl?.checked)
      });

      renderResult(resultEl, best, annualSpend, schema, valuationModeEl.value);
      runBtn.disabled = false;
    }

    renderSpendTable(spendTableEl, schema, categoryDescriptions);
    renderIssues(issuesEl, issues);
    document.getElementById("issuesWrap")?.classList.toggle("hidden", !issues.length);

    updateLockedCardsUi();
    appEl.classList.remove("hidden");

    runBtn.addEventListener("click", runOptimizer);
    clearSpendBtn?.addEventListener("click", () => {
      spendTableEl.querySelectorAll("input[data-cat]").forEach((input) => { input.value = "0"; });
      runOptimizer();
    });
    kInput.addEventListener("input", runOptimizer);
    valuationModeEl?.addEventListener("change", runOptimizer);
    excludeFeeCardsEl?.addEventListener("change", runOptimizer);
    excludeBusinessCardsEl?.addEventListener("change", runOptimizer);
    enableLockedCardsEl?.addEventListener("change", runOptimizer);

    lockedCardSearchEl?.addEventListener("input", renderLockedSearchResults);
    lockedCardOptionsEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-card-id]");
      if (!btn) return;
      lockedCardIds.add(btn.dataset.cardId);
      lockedCardSearchEl.value = "";
      runOptimizer();
    });
    lockedCardPicksEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-id]");
      if (!btn) return;
      lockedCardIds.delete(btn.dataset.removeId);
      runOptimizer();
    });
  } catch (e) {
    statusEl.innerHTML = `<span class="badge bad">Error</span> ${e.message}`;
  }
}

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

main();
