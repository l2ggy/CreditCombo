import { loadCoreData } from "./data-service.js";
import { formatMoneyCAD, formatMultiplier } from "./shared/format.js";
import { renderCardThumb } from "./shared/render.js";

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

function renderEarnRateList(earnRates, rewardsProgram) {
  const list = document.createElement("ul");
  list.className = "dataList listClean";

  const entries = Object.entries(earnRates || {});
  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = "No earn rates available";
    list.append(item);
    return list;
  }

  const cashbackProgram = isCashbackProgram(rewardsProgram);

  entries
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, rate]) => {
      const item = document.createElement("li");

      const categoryEl = document.createElement("span");
      categoryEl.className = "mono";
      categoryEl.textContent = category;

      const valueEl = document.createElement("strong");
      const earnPercent = formatEarnPercentRange(rate, rewardsProgram);

      if (cashbackProgram && earnPercent != null) {
        const percent = document.createElement("span");
        percent.className = "metricSubtle";
        percent.textContent = `${earnPercent}%`;
        valueEl.append(percent);
      } else {
        valueEl.append(`${formatMultiplier(rate)}×`);
        if (earnPercent != null) {
          valueEl.append(" ");
          const percent = document.createElement("span");
          percent.className = "metricSubtle";
          percent.textContent = `(${earnPercent}%)`;
          valueEl.append(percent);
        }
      }

      item.append(categoryEl, valueEl);
      list.append(item);
    });

  return list;
}

function renderCapContent(caps) {
  if (!Array.isArray(caps) || !caps.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No spend caps listed.";
    return empty;
  }

  const list = document.createElement("ul");

  caps.forEach((cap) => {
    const item = document.createElement("li");
    const categories = (cap.categories || []).join(", ") || "multiple categories";
    const limit = formatMoneyCAD(Number(cap.cap_amount ?? 0), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const aboveCapRate = cap.earn_rate_above_cap == null ? "n/a" : formatMultiplier(cap.earn_rate_above_cap);
    const capPeriod = String(cap.cap_period || "period").toLowerCase();
    const periodLabel = capPeriod === "monthly"
      ? "month"
      : capPeriod === "annual"
        ? "year"
        : capPeriod;

    const categoriesEl = document.createElement("span");
    categoriesEl.className = "mono";
    categoriesEl.textContent = categories;

    const limitEl = document.createElement("strong");
    limitEl.textContent = limit;

    item.append(categoriesEl, " capped at ", limitEl, ` per ${periodLabel} (above cap: ${aboveCapRate}×)`);
    list.append(item);
  });

  return list;
}

function renderBrowserCardItem(card) {
  const article = document.createElement("article");
  article.className = "panel card";

  const top = document.createElement("div");
  top.className = "split";

  const heading = document.createElement("div");
  heading.className = "inline";
  heading.append(renderCardThumb(card, { className: "thumb thumb-sm thumb-contain", withFrame: false }));

  const headingText = document.createElement("div");
  const title = document.createElement("h3");
  
  title.textContent = card.card_name;

  const meta = document.createElement("p");
  meta.className = "subtle";
  meta.append(`${card.issuer} · ${card.network} · `);
  const program = document.createElement("span");
  program.className = "mono";
  program.textContent = card.rewards_program;
  meta.append(program);

  headingText.append(title, meta);
  heading.append(headingText);

  const fee = document.createElement("div");
  fee.className = "stack-end";
  const feeLabel = document.createElement("span");
  feeLabel.className = "muted";
  feeLabel.textContent = "Annual fee";
  const feeValue = document.createElement("strong");
  feeValue.textContent = formatMoneyCAD(annualFeeAmount(card), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  fee.append(feeLabel, feeValue);

  top.append(heading, fee);

  const body = document.createElement("div");
  body.className = "splitBody";

  const earnSection = document.createElement("section");
  const earnTitle = document.createElement("h4");
  earnTitle.textContent = "Earn rates";
  earnSection.append(earnTitle, renderEarnRateList(card.earn_rates, card.rewards_program));

  const capSection = document.createElement("section");
  const capTitle = document.createElement("h4");
  capTitle.textContent = "Caps";
  capSection.append(capTitle, renderCapContent(card.caps));

  body.append(earnSection, capSection);

  article.append(top, body);
  return article;
}

function renderCards() {
  state.filteredCards = sortCards(state.cards.filter(cardMatches));

  els.summary.textContent = `Showing ${state.filteredCards.length} of ${state.cards.length} cards.`;
  updateResetButtonState();

  els.cardsList.innerHTML = "";

  if (!state.filteredCards.length) {
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.innerHTML = '<p class="muted">No cards match those filters.</p>';
    els.cardsList.append(panel);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filteredCards.forEach((card) => {
    fragment.append(renderBrowserCardItem(card));
  });
  els.cardsList.append(fragment);
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
    const { cardsJson, programsMap } = await loadCoreData();

    state.programs = programsMap;
    // Card browser intentionally uses the full dataset rather than optimizer-eligible subset.
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
