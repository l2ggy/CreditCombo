import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";
import { annualizeMonthlySpend } from "./optimizer.js";
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
const optimizerLoadingEl = document.getElementById("optimizerLoading");

async function main() {
  try {
    const [cardsJson, programsJson] = await Promise.all([
      loadJson("./data/cards.json"),
      loadJson("./data/programs.json")
    ]);

    const programsMap = normalizePrograms(programsJson);
    const { schema, categoryDescriptions, eligibleCards, issues } = validateAndFilterCards(cardsJson, programsMap);
    const eligibleCardIdSet = new Set(eligibleCards.map((card) => card.id));
    const eligibleCardsById = new Map(eligibleCards.map((card) => [card.id, card]));

    statusEl.innerHTML = `
      <span class="badge good">Loaded</span>
      <span class="muted">${eligibleCards.length} eligible cards · ${issues.length} excluded · ${programsMap.size} programs</span>
    `;

    const lockedCardIds = new Set();

    function selectedLockedCardIds() {
      if (!enableLockedCardsEl?.checked) return [];
      return [...lockedCardIds].filter((id) => eligibleCardIdSet.has(id));
    }

    function unlockedCandidateCards() {
      const selectedIds = new Set(selectedLockedCardIds());
      let pool = eligibleCards.filter((card) => !selectedIds.has(card.id));
      if (excludeFeeCardsEl?.checked) pool = pool.filter((card) => Number(card.annual_fee?.amount ?? 0) <= 0);
      if (excludeBusinessCardsEl?.checked) pool = pool.filter((card) => !card.is_business_card);
      return pool;
    }

    function sanitizeLockedCardSelection() {
      for (const id of [...lockedCardIds]) {
        if (!eligibleCardIdSet.has(id)) lockedCardIds.delete(id);
      }
    }

    function currentMaxAdditionalCards() {
      return Math.max(0, Math.min(5, unlockedCandidateCards().length));
    }

    function syncKBounds() {
      const maxAdditionalCards = currentMaxAdditionalCards();
      const baseMin = enableLockedCardsEl?.checked ? 0 : 1;
      const minValue = maxAdditionalCards < baseMin ? 0 : baseMin;
      kInput.min = String(minValue);
      kInput.max = String(maxAdditionalCards);
      kInput.value = String(clampInt(kInput.value, minValue, maxAdditionalCards));
      return maxAdditionalCards;
    }

    function lockedCardThumbMarkup(card, className = "lockedCardThumb") {
      return `<img class="${className}" src="./assets/cards/${escapeHtml(card.id)}.webp" alt="${escapeHtml(card.card_name)}" loading="lazy" decoding="async" onerror="this.remove()" />`;
    }

    function renderLockedCardPicks() {
      if (!lockedCardPicksEl) return;
      const ids = selectedLockedCardIds();
      if (!ids.length) {
        lockedCardPicksEl.innerHTML = "No locked cards selected.";
        return;
      }

      lockedCardPicksEl.innerHTML = ids
        .map((id) => {
          const card = eligibleCardsById.get(id);
          const label = card ? `${card.card_name} (${card.issuer})` : id;
          return `<span class="lockedChip">${card ? lockedCardThumbMarkup(card) : ""}<span>${escapeHtml(label)}</span> <button type="button" class="lockedChipRemove" data-remove-id="${id}" aria-label="Remove ${escapeHtml(label)}">×</button></span>`;
        })
        .join(" ");
    }

    function searchMatches(query) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return eligibleCards
        .filter((card) => !lockedCardIds.has(card.id))
        .filter((card) => {
          const hay = `${card.card_name} ${card.issuer} ${card.network}`.toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 10);
    }

    function renderLockedSearchResults() {
      if (!lockedCardOptionsEl || !lockedCardSearchEl) return;
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

    function updateSliderLabel() {
      if (!kLabelEl) return;
      kLabelEl.textContent = enableLockedCardsEl?.checked ? "Additional cards" : "Number of cards";
    }

    function updateLockedCardsUi() {
      sanitizeLockedCardSelection();
      const enabled = Boolean(enableLockedCardsEl?.checked);
      lockedCardsPanelEl?.classList.toggle("hidden", !enabled);
      lockedCardsDividerEl?.classList.toggle("hidden", !enabled);

      if (!enabled) {
        if (lockedCardSearchEl) lockedCardSearchEl.value = "";
        lockedCardOptionsEl?.classList.add("hidden");
        if (lockedCardOptionsEl) lockedCardOptionsEl.innerHTML = "";
      }

      renderLockedCardPicks();
      renderLockedSearchResults();
      updateSliderLabel();
    }

    const comboCache = new Map();
    let optimizeTimer = null;
    let optimizeRunToken = 0;
    let activeOptimizeWorker = null;

    function updateKValue() {
      if (kValueEl) kValueEl.textContent = String(kInput.value);
    }

    function setOptimizerLoading(isLoading) {
      if (!optimizerLoadingEl) return;
      optimizerLoadingEl.classList.toggle("hidden", !isLoading);
    }

    function currentValuationMode() {
      return valuationModeEl?.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
    }

    function spendKey(monthlySpend) {
      return schema.map((cat) => `${cat}:${monthlySpend[cat] || 0}`).join("|");
    }

    function getBestComboCacheKey(additionalCards, k, valuationMode, monthlySpend, lockedIds) {
      const excludeFeeCards = excludeFeeCardsEl?.checked ? "excludeFee" : "allCards";
      const excludeBusinessCards = excludeBusinessCardsEl?.checked ? "excludeBusiness" : "includeBusiness";
      const lockKey = [...lockedIds].sort().join(",");
      const additionalIdsKey = additionalCards.map((card) => card.id).sort().join(",");
      return `${spendKey(monthlySpend)}::${valuationMode}::${k}::${excludeFeeCards}::${excludeBusinessCards}::${lockKey}::${additionalIdsKey}`;
    }

    function runOptimizerInWorker(payload) {
      if (activeOptimizeWorker) {
        activeOptimizeWorker.terminate();
        activeOptimizeWorker = null;
      }

      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./optimizer-worker.js", import.meta.url), { type: "module" });
        activeOptimizeWorker = worker;

        worker.onmessage = (event) => {
          const { best, error } = event.data || {};
          worker.terminate();
          if (activeOptimizeWorker === worker) activeOptimizeWorker = null;
          if (error) {
            reject(new Error(error));
            return;
          }
          resolve(best);
        };

        worker.onerror = (event) => {
          worker.terminate();
          if (activeOptimizeWorker === worker) activeOptimizeWorker = null;
          reject(new Error(event.message || "Optimizer worker failed"));
        };

        worker.postMessage(payload);
      });
    }

    async function getBestCombo(additionalCards, k, annualSpend, valuationMode, monthlySpend, lockedIds) {
      const key = getBestComboCacheKey(additionalCards, k, valuationMode, monthlySpend, lockedIds);
      if (comboCache.has(key)) return comboCache.get(key);

      const best = await runOptimizerInWorker({
        cards: eligibleCards,
        programsJson,
        schema,
        k,
        annualSpend,
        valuationMode,
        lockedCardIds: lockedIds,
        additionalCardIds: additionalCards.map((card) => card.id),
      });

      comboCache.set(key, best);
      return best;
    }

    async function runOptimizer(runToken) {
      setOptimizerLoading(true);
      resultEl.classList.add("hidden");
      resultEl.textContent = "Computing…";

      updateLockedCardsUi();
      const selectedLockedIds = selectedLockedCardIds();
      const additionalCards = unlockedCandidateCards();

      const maxAdditionalCards = syncKBounds();
      const minValue = Number(kInput.min || 0);
      const k = clampInt(kInput.value, minValue, maxAdditionalCards);
      kInput.value = String(k);
      updateKValue();

      if (!eligibleCards.length) {
        resultEl.classList.remove("hidden");
        resultEl.innerHTML = `<span class="badge bad">No result</span> No eligible cards are available for optimization.`;
        setOptimizerLoading(false);
        return;
      }

      if (excludeFeeCardsEl?.checked && k > 0 && !additionalCards.length) {
        resultEl.classList.remove("hidden");
        resultEl.innerHTML = `<span class="badge bad">No result</span> No additional cards without annual fees are available.`;
        setOptimizerLoading(false);
        return;
      }

      const valuationMode = currentValuationMode();
      const monthlySpend = readMonthlySpend(schema);
      const hasSpend = schema.some((cat) => (monthlySpend[cat] || 0) > 0);
      if (!hasSpend) {
        resultEl.classList.remove("hidden");
        resultEl.innerHTML = `<span class="muted">Enter monthly spend in at least one category to generate card recommendations.</span>`;
        setOptimizerLoading(false);
        return;
      }

      const annualSpend = annualizeMonthlySpend(monthlySpend, schema);
      const best = await getBestCombo(additionalCards, k, annualSpend, valuationMode, monthlySpend, selectedLockedIds);
      if (runToken !== optimizeRunToken) return;

      renderResult(resultEl, best, annualSpend, schema, valuationMode);
      setOptimizerLoading(false);
    }

    function scheduleOptimizer(delay = 0) {
      optimizeRunToken += 1;
      const runToken = optimizeRunToken;
      if (optimizeTimer) clearTimeout(optimizeTimer);

      setOptimizerLoading(true);

      optimizeTimer = setTimeout(async () => {
        optimizeTimer = null;
        if (runToken !== optimizeRunToken) return;
        try {
          await runOptimizer(runToken);
        } catch (error) {
          if (runToken !== optimizeRunToken) return;
          resultEl.classList.remove("hidden");
          resultEl.innerHTML = `<span class="badge bad">Error</span> ${escapeHtml(error.message || "Optimization failed")}`;
          setOptimizerLoading(false);
        }
      }, delay);
    }

    renderSpendTable(spendTableEl, schema, categoryDescriptions);
    renderIssues(issuesEl, issues);
    const issuesWrap = document.getElementById("issuesWrap");
    if (issuesWrap) {
      if (issues.length) issuesWrap.classList.remove("hidden");
      else issuesWrap.classList.add("hidden");
    }

    updateLockedCardsUi();
    syncKBounds();
    updateKValue();
    appEl.classList.remove("hidden");

    runBtn.addEventListener("click", () => scheduleOptimizer());
    clearSpendBtn?.addEventListener("click", () => {
      spendTableEl.querySelectorAll("input[data-cat]").forEach((input) => {
        input.value = "0";
      });
      scheduleOptimizer();
    });
    kInput.addEventListener("input", () => {
      updateKValue();
      scheduleOptimizer(120);
    });
    valuationModeEl?.addEventListener("change", () => scheduleOptimizer());
    excludeFeeCardsEl?.addEventListener("change", () => scheduleOptimizer());
    excludeBusinessCardsEl?.addEventListener("change", () => scheduleOptimizer());
    enableLockedCardsEl?.addEventListener("change", () => scheduleOptimizer());

    lockedCardSearchEl?.addEventListener("input", () => {
      renderLockedSearchResults();
    });

    lockedCardOptionsEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-card-id]");
      if (!btn) return;
      lockedCardIds.add(btn.dataset.cardId);
      if (lockedCardSearchEl) lockedCardSearchEl.value = "";
      scheduleOptimizer();
    });

    lockedCardPicksEl?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-id]");
      if (!btn) return;
      lockedCardIds.delete(btn.dataset.removeId);
      scheduleOptimizer();
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
