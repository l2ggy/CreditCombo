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
const enableLockedCardsEl = document.getElementById("enableLockedCards");
const lockedCardsPanelEl = document.getElementById("lockedCardsPanel");
const lockedCardSearchEl = document.getElementById("lockedCardSearch");
const lockedCardOptionsEl = document.getElementById("lockedCardOptions");
const lockedCardPicksEl = document.getElementById("lockedCardPicks");

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

    const lockedCardIds = new Set();

    function filteredCards() {
      if (!excludeFeeCardsEl?.checked) return eligibleCards;
      return eligibleCards.filter((card) => Number(card.annual_fee?.amount ?? 0) <= 0);
    }

    function sanitizeLockedCardSelection(cardsToConsider) {
      const allowedIds = new Set(cardsToConsider.map((card) => card.id));
      for (const id of [...lockedCardIds]) {
        if (!allowedIds.has(id)) lockedCardIds.delete(id);
      }
    }

    function selectedLockedCardIds(cardsToConsider) {
      if (!enableLockedCardsEl?.checked) return [];
      const allowedIds = new Set(cardsToConsider.map((card) => card.id));
      return [...lockedCardIds].filter((id) => allowedIds.has(id));
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

    function cardsById(cards) {
      return new Map(cards.map((card) => [card.id, card]));
    }

    function renderLockedCardPicks(cardsToConsider) {
      if (!lockedCardPicksEl) return;
      const byId = cardsById(cardsToConsider);
      const ids = selectedLockedCardIds(cardsToConsider);
      if (!ids.length) {
        lockedCardPicksEl.innerHTML = "No locked cards selected.";
        return;
      }

      lockedCardPicksEl.innerHTML = ids
        .map((id) => {
          const card = byId.get(id);
          const label = card ? `${card.card_name} (${card.issuer})` : id;
          return `<span class="lockedChip">${escapeHtml(label)} <button type="button" class="lockedChipRemove" data-remove-id="${id}" aria-label="Remove ${escapeHtml(label)}">×</button></span>`;
        })
        .join(" ");
    }

    function searchMatches(cardsToConsider, query) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return cardsToConsider
        .filter((card) => !lockedCardIds.has(card.id))
        .filter((card) => {
          const hay = `${card.card_name} ${card.issuer} ${card.network}`.toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 10);
    }

    function renderLockedSearchResults(cardsToConsider) {
      if (!lockedCardOptionsEl || !lockedCardSearchEl) return;
      const matches = searchMatches(cardsToConsider, lockedCardSearchEl.value || "");
      if (!matches.length) {
        lockedCardOptionsEl.classList.add("hidden");
        lockedCardOptionsEl.innerHTML = "";
        return;
      }

      lockedCardOptionsEl.classList.remove("hidden");
      lockedCardOptionsEl.innerHTML = matches
        .map((card) => `<button type="button" class="lockedOption" data-card-id="${card.id}">${escapeHtml(card.card_name)} <span class="muted">(${escapeHtml(card.issuer)})</span></button>`)
        .join("");
    }

    function updateLockedCardsUi(cardsToConsider) {
      sanitizeLockedCardSelection(cardsToConsider);
      const enabled = Boolean(enableLockedCardsEl?.checked);
      lockedCardsPanelEl?.classList.toggle("hidden", !enabled);

      if (!enabled) {
        if (lockedCardSearchEl) lockedCardSearchEl.value = "";
        lockedCardOptionsEl?.classList.add("hidden");
        if (lockedCardOptionsEl) lockedCardOptionsEl.innerHTML = "";
      }

      renderLockedCardPicks(cardsToConsider);
      renderLockedSearchResults(cardsToConsider);
    }

    const comboCache = new Map();

    function updateKValue() {
      if (kValueEl) kValueEl.textContent = String(kInput.value);
    }

    function currentValuationMode() {
      return valuationModeEl?.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
    }

    function spendKey(monthlySpend) {
      return schema.map((cat) => `${cat}:${monthlySpend[cat] || 0}`).join("|");
    }

    function getBestCombo(cards, k, annualSpend, valuationMode, monthlySpend, lockedIds) {
      const excludeFeeCards = excludeFeeCardsEl?.checked ? "excludeFee" : "allCards";
      const lockKey = [...lockedIds].sort().join(",");
      const key = `${spendKey(monthlySpend)}::${valuationMode}::${k}::${excludeFeeCards}::${lockKey}`;
      if (comboCache.has(key)) return comboCache.get(key);

      const best = findBestCombo({
        cards,
        programsMap,
        schema,
        k,
        annualSpend,
        valuationMode,
        lockedCardIds: lockedIds
      });
      comboCache.set(key, best);
      return best;
    }

    function runOptimizer() {
      runBtn.disabled = true;
      resultEl.classList.add("hidden");
      resultEl.textContent = "Computing…";

      const cardsToConsider = filteredCards();
      updateLockedCardsUi(cardsToConsider);
      const selectedLockedIds = selectedLockedCardIds(cardsToConsider);

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

      if (!selectedLockedIds.length && k === 0) {
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
      const best = getBestCombo(cardsToConsider, k, annualSpend, valuationMode, monthlySpend, selectedLockedIds);

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

    updateLockedCardsUi(filteredCards());
    syncKBounds(filteredCards());
    updateKValue();
    appEl.classList.remove("hidden");

    runBtn.addEventListener("click", runOptimizer);
    kInput.addEventListener("input", runOptimizer);
    valuationModeEl?.addEventListener("change", runOptimizer);
    excludeFeeCardsEl?.addEventListener("change", runOptimizer);
    enableLockedCardsEl?.addEventListener("change", runOptimizer);

    lockedCardSearchEl?.addEventListener("input", () => {
      const cardsToConsider = filteredCards();
      renderLockedSearchResults(cardsToConsider);
    });

    lockedCardOptionsEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-card-id]");
      if (!btn) return;
      lockedCardIds.add(btn.dataset.cardId);
      if (lockedCardSearchEl) lockedCardSearchEl.value = "";
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
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

main();
