import { loadJson } from "./data.js";

const state = {
  cards: [],
  filteredCards: []
};

const els = {
  searchInput: document.getElementById("searchInput"),
  issuerFilter: document.getElementById("issuerFilter"),
  programFilter: document.getElementById("programFilter"),
  sortBy: document.getElementById("sortBy"),
  cardsList: document.getElementById("cardsList"),
  summary: document.getElementById("browserSummary"),
  fatal: document.getElementById("browserFatal")
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
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
  const sortBy = els.sortBy.value;
  const sorted = [...cards];

  if (sortBy === "annualFeeAsc") {
    sorted.sort((a, b) => annualFeeAmount(a) - annualFeeAmount(b) || a.card_name.localeCompare(b.card_name));
  } else if (sortBy === "annualFeeDesc") {
    sorted.sort((a, b) => annualFeeAmount(b) - annualFeeAmount(a) || a.card_name.localeCompare(b.card_name));
  } else if (sortBy === "issuer") {
    sorted.sort((a, b) => a.issuer.localeCompare(b.issuer) || a.card_name.localeCompare(b.card_name));
  } else {
    sorted.sort((a, b) => a.card_name.localeCompare(b.card_name));
  }

  return sorted;
}

function earnRateMarkup(earnRates) {
  const entries = Object.entries(earnRates || {});
  if (!entries.length) return "<li class=\"muted\">No earn rates available</li>";

  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([category, rate]) => `<li><span class="mono">${category}</span><strong>${rate}×</strong></li>`)
    .join("");
}

function capMarkup(caps) {
  if (!Array.isArray(caps) || !caps.length) return '<p class="muted">No spend caps listed.</p>';

  return `<ul>${caps.map((cap) => {
    const categories = (cap.categories || []).join(", ") || "multiple categories";
    const limit = formatCurrency(Number(cap.cap_amount ?? 0));
    return `<li><span class="mono">${categories}</span> capped at <strong>${limit}</strong> per ${cap.cap_period || "period"} (above cap: ${cap.earn_rate_above_cap ?? "n/a"}×)</li>`;
  }).join("")}</ul>`;
}

function renderCards() {
  state.filteredCards = sortCards(state.cards.filter(cardMatches));

  els.summary.textContent = `Showing ${state.filteredCards.length} of ${state.cards.length} cards.`;

  if (!state.filteredCards.length) {
    els.cardsList.innerHTML = '<section class="panel"><p class="muted">No cards match those filters.</p></section>';
    return;
  }

  els.cardsList.innerHTML = state.filteredCards.map((card) => `
    <article class="panel browserCard">
      <div class="browserCardTop">
        <div>
          <h3 class="browserCardTitle">${card.card_name}</h3>
          <p class="subtle">${card.issuer} · ${card.network} · <span class="mono">${card.rewards_program}</span></p>
        </div>
        <div class="browserFee">
          <span class="muted">Annual fee</span>
          <strong>${formatCurrency(annualFeeAmount(card))}</strong>
        </div>
      </div>

      <div class="browserCardBody">
        <section>
          <h4>Earn rates</h4>
          <ul class="browserRateList">${earnRateMarkup(card.earn_rates)}</ul>
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
}

async function init() {
  try {
    const cardsJson = await loadJson("./cards.json");
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
