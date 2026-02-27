import { loadJson, normalizePrograms } from "./data.js";

const state = {
  cards: [],
  programs: new Map(),
  filteredCards: []
};

const els = {
  searchInput: document.getElementById("searchInput"),
  issuerFilter: document.getElementById("issuerFilter"),
  programFilter: document.getElementById("programFilter"),
  sortBy: document.getElementById("sortBy"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),
  cardsList: document.getElementById("cardsList"),
  summary: document.getElementById("browserSummary"),
  fatal: document.getElementById("browserFatal")
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}

function formatMultiplier(value, significantDigits = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  if (numericValue === 0) return "0";

  const absValue = Math.abs(numericValue);
  const order = Math.floor(Math.log10(absValue));
  const scale = 10 ** (significantDigits - 1 - order);
  const roundedValue = Math.round(numericValue * scale) / scale;
  const fractionDigits = Math.max(0, significantDigits - 1 - order);

  return roundedValue.toFixed(fractionDigits).replace(/\.?0+$/, "");
}

function annualFeeAmount(card) {
  return Number(card?.annual_fee?.amount ?? 0);
}

function populateSelect(selectEl, values, allLabel) {
  selectEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  selectEl.append(allOption);

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.append(option);
  }
}

function hasActiveFilters() {
  return Boolean(
    els.searchInput.value.trim()
    || els.issuerFilter.value
    || els.programFilter.value
    || els.sortBy.value !== "name"
  );
}

function resetFilters() {
  els.searchInput.value = "";
  els.issuerFilter.value = "";
  els.programFilter.value = "";
  els.sortBy.value = "name";
}

function updateResetButtonState() {
  if (!els.resetFiltersBtn) return;
  els.resetFiltersBtn.disabled = !hasActiveFilters();
}

function cardMatches(card) {
  const query = els.searchInput.value.trim().toLowerCase();
  const issuer = els.issuerFilter.value;
  const program = els.programFilter.value;

  if (issuer && card.issuer !== issuer) return false;
  if (program && card.rewards_program !== program) return false;

  if (!query) return true;

  const haystack = [
    card.card_name,
    card.issuer,
    card.network,
    card.rewards_program,
    ...Object.keys(card.earn_rates || {})
  ].join(" ").toLowerCase();

  return haystack.includes(query);
}

function sortCards(cards) {
  const sorters = {
    annualFeeAsc: (a, b) => annualFeeAmount(a) - annualFeeAmount(b) || a.card_name.localeCompare(b.card_name),
    annualFeeDesc: (a, b) => annualFeeAmount(b) - annualFeeAmount(a) || a.card_name.localeCompare(b.card_name),
    issuer: (a, b) => a.issuer.localeCompare(b.issuer) || a.card_name.localeCompare(b.card_name),
    name: (a, b) => a.card_name.localeCompare(b.card_name)
  };

  const sorter = sorters[els.sortBy.value] ?? sorters.name;
  return [...cards].sort(sorter);
}

function formatEarnPercentRange(multiplierRate, rewardsProgram) {
  const program = state.programs.get(rewardsProgram);
  const estimatedCentsPerPoint = Number(program?.cents_per_point);
  if (!Number.isFinite(estimatedCentsPerPoint)) return null;

  const minimumCentsPerPoint = Number(program?.minimum_cents_per_point);
  const guaranteedCentsPerPoint = Number.isFinite(minimumCentsPerPoint)
    ? minimumCentsPerPoint
    : estimatedCentsPerPoint;

  const minimumPercent = (multiplierRate * guaranteedCentsPerPoint).toFixed(1);
  const estimatedPercent = (multiplierRate * estimatedCentsPerPoint).toFixed(1);

  if (minimumPercent === estimatedPercent) return estimatedPercent;
  return `${minimumPercent}-${estimatedPercent}`;
}

function isCashbackProgram(rewardsProgram) {
  return state.programs.get(rewardsProgram)?.program_type === "cashback";
}

function earnRateMarkup(earnRates, rewardsProgram) {
  const entries = Object.entries(earnRates || {});
  if (!entries.length) return "<li class=\"muted\">No earn rates available</li>";
  const cashbackProgram = isCashbackProgram(rewardsProgram);

  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([category, rate]) => {
      const earnPercent = formatEarnPercentRange(rate, rewardsProgram);
      if (cashbackProgram && earnPercent != null) {
        return `<li><span class="mono">${category}</span><strong><span class="browserEarnPercent">${earnPercent}%</span></strong></li>`;
      }

      const percentMarkup = earnPercent == null ? "" : `<span class="browserEarnPercent">(${earnPercent}%)</span>`;
      return `<li><span class="mono">${category}</span><strong>${formatMultiplier(rate)}× ${percentMarkup}</strong></li>`;
    })
    .join("");
}

function capMarkup(caps) {
  if (!Array.isArray(caps) || !caps.length) return '<p class="muted">No spend caps listed.</p>';

  return `<ul>${caps.map((cap) => {
    const categories = (cap.categories || []).join(", ") || "multiple categories";
    const limit = formatCurrency(Number(cap.cap_amount ?? 0));
    const aboveCapRate = cap.earn_rate_above_cap == null ? "n/a" : formatMultiplier(cap.earn_rate_above_cap);
    return `<li><span class="mono">${categories}</span> capped at <strong>${limit}</strong> per ${cap.cap_period || "period"} (above cap: ${aboveCapRate}×)</li>`;
  }).join("")}</ul>`;
}

function cardThumbnailMarkup(cardId, cardName) {
  const imageSrc = `./assets/cards/${cardId}.webp`;
  return `<img class="browserCardThumb" src="${imageSrc}" alt="${cardName}" loading="lazy" decoding="async" onerror="this.remove()" />`;
}

function renderCards() {
  state.filteredCards = sortCards(state.cards.filter(cardMatches));

  els.summary.textContent = `Showing ${state.filteredCards.length} of ${state.cards.length} cards.`;
  updateResetButtonState();

  if (!state.filteredCards.length) {
    els.cardsList.innerHTML = '<section class="panel"><p class="muted">No cards match those filters.</p></section>';
    return;
  }

  els.cardsList.innerHTML = state.filteredCards.map((card) => `
    <article class="panel browserCard">
      <div class="browserCardTop">
        <div class="browserCardHeading">
          ${cardThumbnailMarkup(card.id, card.card_name)}
          <div>
            <h3 class="browserCardTitle">${card.card_name}</h3>
            <p class="subtle">${card.issuer} · ${card.network} · <span class="mono">${card.rewards_program}</span></p>
          </div>
        </div>
        <div class="browserFee">
          <span class="muted">Annual fee</span>
          <strong>${formatCurrency(annualFeeAmount(card))}</strong>
        </div>
      </div>

      <div class="browserCardBody">
        <section>
          <h4>Earn rates</h4>
          <ul class="browserRateList">${earnRateMarkup(card.earn_rates, card.rewards_program)}</ul>
        </section>
        <section>
          <h4>Caps</h4>
          ${capMarkup(card.caps)}
        </section>
      </div>
    </article>
  `).join("");
}

function registerEvents() {
  [els.searchInput, els.issuerFilter, els.programFilter, els.sortBy].forEach((el) => {
    el.addEventListener("input", renderCards);
    el.addEventListener("change", renderCards);
  });

  if (els.resetFiltersBtn) {
    els.resetFiltersBtn.addEventListener("click", () => {
      resetFilters();
      renderCards();
    });
  }
}

async function init() {
  try {
    const [cardsJson, programsJson] = await Promise.all([
      loadJson("./data/cards.json"),
      loadJson("./data/programs.json")
    ]);

    state.programs = normalizePrograms(programsJson);
    state.cards = cardsJson?.cards ?? [];

    const issuers = [...new Set(state.cards.map((c) => c.issuer))].sort((a, b) => a.localeCompare(b));
    const programs = [...new Set(state.cards.map((c) => c.rewards_program))].sort((a, b) => a.localeCompare(b));

    populateSelect(els.issuerFilter, issuers, "All issuers");
    populateSelect(els.programFilter, programs, "All programs");

    registerEvents();
    renderCards();
  } catch (error) {
    els.fatal.classList.remove("hidden");
    els.fatal.textContent = `Error loading card browser: ${error?.message || "Unknown error"}`;
  }
}

init();
