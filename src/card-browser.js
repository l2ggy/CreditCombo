import { loadCoreData } from "./data-service.js";
import { formatMoneyCAD, formatMultiplier } from "./shared/format.js";
import { formatIssuerNetwork, renderCardThumb, renderOfficialCardLink } from "./shared/render.js";
import { buildSearchText, scoreSearchMatch, tokenizeSearchQuery } from "./shared/search.js";
import { merchantPortalConfigs, subcategoryRateForCard } from "./subcategory-config.js";

const state = {
  cards: [],
  programs: new Map(),
  subcategoryConfigs: {},
  filteredCards: []
};

const els = {
  searchInput: document.getElementById("searchInput"),
  issuerFilter: document.getElementById("issuerFilter"),
  programFilter: document.getElementById("programFilter"),
  sortBy: document.getElementById("sortBy"),
  sortEarnCategoryField: document.getElementById("sortEarnCategoryField"),
  sortEarnCategory: document.getElementById("sortEarnCategory"),
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
    || els.sortEarnCategory.value
  );
}

function resetFilters() {
  els.searchInput.value = "";
  els.issuerFilter.value = "";
  els.programFilter.value = "";
  els.sortBy.value = "name";
  els.sortEarnCategory.value = "";
  updateSortEarnCategoryState();
}

function sortEarnPercentRateForCategory(card, category) {
  const earnMultiplier = Number(card?.earn_rates?.[category] ?? 0);
  const centsPerPoint = Number(state.programs.get(card?.rewards_program)?.cents_per_point ?? 0);
  if (!Number.isFinite(earnMultiplier) || !Number.isFinite(centsPerPoint)) return 0;
  return earnMultiplier * centsPerPoint;
}

function updateSortEarnCategoryState() {
  const isCategorySort = els.sortBy.value === "earnRateCategoryDesc";
  els.sortEarnCategoryField.hidden = !isCategorySort;
  els.sortEarnCategory.disabled = !isCategorySort;
  if (!isCategorySort) {
    els.sortEarnCategory.value = "";
  }
}

function updateResetButtonState() {
  if (!els.resetFiltersBtn) return;
  els.resetFiltersBtn.disabled = !hasActiveFilters();
}

function cardSearchScore(card, queryTokens) {
  const searchText = buildSearchText([
    card.card_name,
    card.issuer,
    card.network,
    card.rewards_program,
    ...Object.keys(card.earn_rates || {})
  ]);

  const fullScore = scoreSearchMatch(searchText, queryTokens);
  if (fullScore < 0) return -1;

  const cardNameScore = scoreSearchMatch(buildSearchText(card.card_name), queryTokens);
  return fullScore + (cardNameScore > 0 ? cardNameScore * 3 : 0);
}

function cardMatches(card, queryTokens) {
  const issuer = els.issuerFilter.value;
  const program = els.programFilter.value;

  if (issuer && card.issuer !== issuer) return false;
  if (program && card.rewards_program !== program) return false;
  if (!queryTokens.length) return true;

  return cardSearchScore(card, queryTokens) >= 0;
}

function cardSortComparator() {
  const sorters = {
    annualFeeAsc: (a, b) => annualFeeAmount(a) - annualFeeAmount(b) || a.card_name.localeCompare(b.card_name),
    annualFeeDesc: (a, b) => annualFeeAmount(b) - annualFeeAmount(a) || a.card_name.localeCompare(b.card_name),
    issuer: (a, b) => a.issuer.localeCompare(b.issuer) || a.card_name.localeCompare(b.card_name),
    earnRateCategoryDesc: (a, b) => {
      const category = els.sortEarnCategory.value;
      const rateDiff = sortEarnPercentRateForCategory(b, category) - sortEarnPercentRateForCategory(a, category);
      return rateDiff || a.card_name.localeCompare(b.card_name);
    },
    name: (a, b) => a.card_name.localeCompare(b.card_name)
  };

  return sorters[els.sortBy.value] ?? sorters.name;
}

function sortCards(cards) {
  return [...cards].sort(cardSortComparator());
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


function cardRate(card, cat) {
  const er = card.earn_rates || {};
  if (er[cat] != null) return Number(er[cat]);
  if (er.other != null) return Number(er.other);
  return 0;
}

function merchantPortalEntriesForCard(card) {
  return merchantPortalConfigs(state.subcategoryConfigs)
    .map((config) => ({
      label: `${config.label} (${config.browserTag === "portal" ? "portal" : "merchant"})`,
      rate: subcategoryRateForCard(config, card, config.parentCategory, cardRate),
      explicitRate: Number(card?.subcategory_earn_rates?.[config.key])
    }))
    .filter((entry) => Number.isFinite(entry.rate) && entry.rate > 0 && entry.explicitRate === entry.rate)
    .sort((a, b) => b.rate - a.rate || a.label.localeCompare(b.label));
}

function renderRateList(entries, rewardsProgram, emptyMessage) {
  const list = document.createElement("ul");
  list.className = "dataList listClean";

  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = emptyMessage;
    list.append(item);
    return list;
  }

  const cashbackProgram = isCashbackProgram(rewardsProgram);

  entries
    .sort((a, b) => b.rate - a.rate || a.label.localeCompare(b.label))
    .forEach(({ label, rate }) => {
      const item = document.createElement("li");

      const labelEl = document.createElement("span");
      labelEl.className = "mono";
      labelEl.textContent = label;

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

      item.append(labelEl, valueEl);
      list.append(item);
    });

  return list;
}

function renderEarnRateList(earnRates, rewardsProgram) {
  const entries = Object.entries(earnRates || {}).map(([label, rate]) => ({ label, rate: Number(rate) }));
  return renderRateList(entries, rewardsProgram, "No earn rates available");
}

function renderCapContent(caps) {
  if (!Array.isArray(caps) || !caps.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No caps.";
    return empty;
  }

  const list = document.createElement("ul");
  list.className = "dataList listClean";

  caps.forEach((cap) => {
    const item = document.createElement("li");
    const categories = (cap.categories || []).join(", ") || "multiple";
    const limit = formatMoneyCAD(Number(cap.cap_amount ?? 0), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const aboveCapRate = cap.earn_rate_above_cap == null ? "n/a" : `${formatMultiplier(cap.earn_rate_above_cap)}×`;
    const period = String(cap.cap_period || "period").toLowerCase();
    const shortPeriod = period === "monthly" ? "/mo" : period === "annual" ? "/yr" : `/${period}`;

    const categoriesEl = document.createElement("span");
    categoriesEl.className = "mono";
    categoriesEl.textContent = categories;

    const valueEl = document.createElement("strong");
    valueEl.textContent = `${limit}${shortPeriod}`;

    const aboveEl = document.createElement("span");
    aboveEl.className = "metricSubtle";
    aboveEl.textContent = `↑ ${aboveCapRate}`;

    item.append(categoriesEl, valueEl, aboveEl);
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
  const issuerNetwork = formatIssuerNetwork(card);
  if (issuerNetwork) {
    meta.append(`${issuerNetwork} · `);
  }
  const program = document.createElement("span");
  program.className = "mono";
  program.textContent = card.rewards_program;
  meta.append(program);

  headingText.append(title, meta);
  heading.append(headingText);

  const fee = document.createElement("div");
  fee.className = "stack-end";
  const feeLabel = document.createElement("span");
  feeLabel.className = "muted cardFeeLabel";
  feeLabel.textContent = "Annual fee";
  const feeValue = document.createElement("strong");
  feeValue.className = "cardFeeValue";
  feeValue.textContent = formatMoneyCAD(annualFeeAmount(card), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  fee.append(feeLabel, feeValue);

  const officialLink = renderOfficialCardLink(card);
  if (officialLink) {
    meta.append(" · ", officialLink);
  }

  top.append(heading, fee);

  const topDivider = document.createElement("div");
  topDivider.className = "divider cardDividerTop";

  const body = document.createElement("div");
  body.className = "splitBody";

  const earnSection = document.createElement("section");
  const earnTitle = document.createElement("h4");
  earnTitle.textContent = "Earn rates";
  earnSection.append(earnTitle, renderEarnRateList(card.earn_rates, card.rewards_program));

  const merchantEntries = merchantPortalEntriesForCard(card);
  if (merchantEntries.length) {
    const merchantSection = document.createElement("section");
    const merchantTitle = document.createElement("h4");
    merchantTitle.textContent = "Merchant & portal rates";
    merchantSection.append(merchantTitle, renderRateList(merchantEntries, card.rewards_program, "No merchant/portal-specific rates modeled."));
    earnSection.append(merchantSection);
  }

  const sectionDivider = document.createElement("div");
  sectionDivider.className = "divider cardDividerSection";

  const capSection = document.createElement("section");
  const capTitle = document.createElement("h4");
  capTitle.textContent = "Caps";
  capSection.append(capTitle, renderCapContent(card.caps));

  body.append(earnSection, sectionDivider, capSection);

  article.append(top, topDivider, body);
  return article;
}

function renderCards() {
  const queryTokens = tokenizeSearchQuery(els.searchInput.value);
  const sortComparator = cardSortComparator();

  const filteredCards = state.cards
    .filter((card) => cardMatches(card, queryTokens))
    .map((card) => ({ card, score: queryTokens.length ? cardSearchScore(card, queryTokens) : 0 }));

  filteredCards.sort((a, b) => {
    if (queryTokens.length && b.score !== a.score) return b.score - a.score;
    return sortComparator(a.card, b.card);
  });

  state.filteredCards = filteredCards.map(({ card }) => card);

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
  [els.searchInput, els.issuerFilter, els.programFilter].forEach((el) => {
    el.addEventListener("input", renderCards);
    el.addEventListener("change", renderCards);
  });

  els.sortBy.addEventListener("change", () => {
    updateSortEarnCategoryState();
    renderCards();
  });
  els.sortEarnCategory.addEventListener("input", renderCards);
  els.sortEarnCategory.addEventListener("change", renderCards);

  if (els.resetFiltersBtn) {
    els.resetFiltersBtn.addEventListener("click", () => {
      resetFilters();
      renderCards();
    });
  }
}

async function init() {
  try {
    const { cardsJson, programsMap, subcategoryConfigs } = await loadCoreData();

    state.subcategoryConfigs = subcategoryConfigs || {};

    state.programs = programsMap;
    // Card browser intentionally uses the full dataset rather than optimizer-eligible subset.
    state.cards = cardsJson?.cards ?? [];

    const issuers = [...new Set(state.cards.map((c) => c.issuer))].sort((a, b) => a.localeCompare(b));
    const programs = [...new Set(state.cards.map((c) => c.rewards_program))].sort((a, b) => a.localeCompare(b));
    const earnCategories = [...new Set(state.cards.flatMap((card) => Object.keys(card.earn_rates || {})))]
      .sort((a, b) => a.localeCompare(b));

    populateSelect(els.issuerFilter, issuers, "All issuers");
    populateSelect(els.programFilter, programs, "All programs");
    populateSelect(els.sortEarnCategory, earnCategories, "Select category");

    registerEvents();
    updateSortEarnCategoryState();
    renderCards();
  } catch (error) {
    els.fatal.classList.remove("hidden");
    els.fatal.textContent = `Error loading card browser: ${error?.message || "Unknown error"}`;
  }
}

init();
