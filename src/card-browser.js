import { loadCoreData } from "./data-service.js";
import { formatMoneyCAD, formatMultiplier } from "./shared/format.js";
import { formatIssuerNetwork, renderCardThumb, renderOfficialCardLink } from "./shared/render.js";
import { createCardSearchIndex, rankCardMatches } from "./shared/card-search.js";
import { merchantPortalConfigs, subcategoryRateForCard } from "./subcategory-config.js";
import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";
import { initAuthUi } from "./shared/auth.js";

const state = {
  cards: [],
  cardSearchIndex: [],
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

function cardMatches(card) {
  const issuer = els.issuerFilter.value;
  const program = els.programFilter.value;

  if (issuer && card.issuer !== issuer) return false;
  if (program && card.rewards_program !== program) return false;
  return true;
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
    .filter((entry) => Number.isFinite(entry.rate) && entry.rate > 0 && entry.explicitRate === entry.rate);
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

function renderBrowserCardItem(card, position) {
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
    officialLink.dataset.analyticsOfficialLink = "1";
    officialLink.dataset.issuer = card.issuer || "";
    officialLink.dataset.cardName = card.card_name || "";
    officialLink.dataset.program = card.rewards_program || "";
    officialLink.dataset.surface = "card_browser_list";
    officialLink.dataset.position = String(position);
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
  const hasCaps = Array.isArray(card.caps) && card.caps.length > 0;

  if (hasCaps) {
    if (merchantEntries.length) {
      const merchantSection = document.createElement("section");
      const merchantTitle = document.createElement("h4");
      merchantTitle.textContent = "Merchant & portal rates";
      merchantSection.append(merchantTitle, renderRateList(merchantEntries, card.rewards_program, ""));
      earnSection.append(merchantSection);
    }

    const sectionDivider = document.createElement("div");
    sectionDivider.className = "divider cardDividerSection";

    const capSection = document.createElement("section");
    const capTitle = document.createElement("h4");
    capTitle.textContent = "Caps";
    capSection.append(capTitle, renderCapContent(card.caps));

    body.append(earnSection, sectionDivider, capSection);
  } else if (merchantEntries.length) {
    body.classList.add("splitBodyNoCaps");

    const merchantSection = document.createElement("section");
    const merchantTitle = document.createElement("h4");
    merchantTitle.textContent = "Merchant & portal rates";
    merchantSection.append(merchantTitle, renderRateList(merchantEntries, card.rewards_program, ""));

    body.append(earnSection, merchantSection);
  } else {
    body.append(earnSection);
  }

  article.append(top, topDivider, body);
  return article;
}

function renderCards() {
  const query = els.searchInput.value;
  const matchedCards = query.trim()
    ? rankCardMatches(state.cardSearchIndex, query, { limit: state.cards.length })
    : state.cards;

  const filteredCards = matchedCards.filter(cardMatches);

  state.filteredCards = query.trim()
    ? filteredCards
    : sortCards(filteredCards);

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
  state.filteredCards.forEach((card, index) => {
    fragment.append(renderBrowserCardItem(card, index + 1));
  });
  trackEvent("card_browser_results_rendered", { result_count: state.filteredCards.length });
  els.cardsList.append(fragment);
}

function registerEvents() {
  [els.searchInput, els.issuerFilter, els.programFilter].forEach((el) => {
    el.addEventListener("input", () => {
      trackEvent("card_browser_filter_changed", { filter_name: el.id, value: el.value || "" });
      renderCards();
    });
    el.addEventListener("change", () => {
      trackEvent("card_browser_filter_changed", { filter_name: el.id, value: el.value || "" });
      renderCards();
    });
  });

  els.sortBy.addEventListener("change", () => {
    trackEvent("card_browser_sort_changed", { sort_by: els.sortBy.value });
    updateSortEarnCategoryState();
    renderCards();
  });
  els.sortEarnCategory.addEventListener("input", () => {
    trackEvent("card_browser_sort_changed", { sort_by: els.sortBy.value, earn_category: els.sortEarnCategory.value || "" });
    renderCards();
  });
  els.sortEarnCategory.addEventListener("change", () => {
    trackEvent("card_browser_sort_changed", { sort_by: els.sortBy.value, earn_category: els.sortEarnCategory.value || "" });
    renderCards();
  });

  if (els.resetFiltersBtn) {
    els.resetFiltersBtn.addEventListener("click", () => {
      trackEvent("card_browser_reset_filters");
      resetFilters();
      renderCards();
    });
  }

  els.cardsList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a[data-analytics-official-link]");
    if (!link) return;
    trackEvent("card_official_link_clicked", {
      issuer: link.dataset.issuer || undefined,
      card_name: link.dataset.cardName || undefined,
      program: link.dataset.program || undefined,
      surface: link.dataset.surface || "card_browser_list",
      position: Number(link.dataset.position || 0) || undefined
    });
  });
}

async function init() {
  trackPageView("card_browser");
  trackEvent("session_started", sessionEntryContext());
  await initAuthUi({ mountEl: document.querySelector("#authMount") });

  try {
    const { cardsJson, programsMap, subcategoryConfigs } = await loadCoreData();

    state.subcategoryConfigs = subcategoryConfigs || {};

    state.programs = programsMap;
    // Card browser intentionally uses the full dataset rather than optimizer-eligible subset.
    state.cards = cardsJson?.cards ?? [];
    state.cardSearchIndex = createCardSearchIndex(state.cards);

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
    trackEvent("card_browser_view_loaded", { total_cards: state.cards.length });
  } catch (error) {
    els.fatal.classList.remove("hidden");
    els.fatal.textContent = `Error loading card browser: ${error?.message || "Unknown error"}`;
  }
}

init();
