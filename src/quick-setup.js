import { loadOptimizerData } from "./data-service.js";
import { buildOptimizerDeepLink } from "./app/deeplink.js";
import { annualizeMonthlySpend, chexyAdjustedAnnualSpend, findBestCombo } from "./optimizer.js";
import { renderResult } from "./ui.js";
import { renderLockedChip } from "./shared/render.js";
import { bindCardSearchKeyboard, createCardSearchIndex, rankCardMatches, renderCardSearchOptions } from "./shared/card-search.js";
import { formatMoneyCAD } from "./shared/format.js";
import { escapeHtml } from "./shared/sanitize.js";
import { createShareOverlay } from "./share/share-overlay.js";
import { buildShareContext } from "./share/share-context.js";
import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";

const appEl = document.getElementById("quickSetupApp");
const QUICK_SETUP_DEFAULTS = Object.freeze({
  includeBusinessCards: false
});

const state = {
  mode: null,
  monthlySpend: {},
  subcategorySpend: {},
  lockedCardIds: [],
  k: 1,
  valuationMode: null,
  quizResponses: {},
  view: "quiz",
  results: null,
  resultsLoading: false
};

let ctx = null;
let shareOverlay = null;
let lastTrackedStepView = "";
let visibleSteps = [];
let currentStepIndex = 0;

function ensureShareOverlay() {
  if (!shareOverlay) {
    shareOverlay = createShareOverlay({
      onOpen: () => trackEvent("quick_setup_share_clicked", { source: "result_share_overlay" }),
      onNativeShareSuccess: () => trackEvent("quick_setup_share_clicked", { source: "native_share_success" }),
      onDownloadSuccess: () => trackEvent("quick_setup_share_clicked", { source: "download_success" })
    });
  }
  return shareOverlay;
}

function resolveQuizMode(value) {
  return value === "current_cards" ? "current_cards" : "ideal_combo";
}

function titleForCategory(cat) {
  const labels = {
    grocery: "groceries",
    dining: "dining",
    gas: "gas",
    transit: "transit",
    rideshare: "rideshares",
    streaming: "streaming",
    digital: "digital purchases",
    utilities: "utilities",
    bills: "bills",
    drugstore: "drugstore purchases",
    entertainment: "entertainment",
    travel: "travel",
    other: "other purchases"
  };
  return labels[cat] || String(cat).replace(/_/g, " ");
}

function categoryDetailsFor(cat) {
  return String(ctx?.categoryDescriptions?.[cat] || "").trim().replace(/\s+/g, " ");
}

function spendSliderConfig(cat) {
  const limits = {
    grocery: 2000,
    dining: 1500,
    gas: 1000,
    transit: 800,
    rideshare: 800,
    streaming: 300,
    digital: 500,
    utilities: 1200,
    bills: 3000,
    drugstore: 600,
    entertainment: 1200,
    travel: 4000,
    other: 5000
  };

  const max = Number(limits[cat]) || 2000;
  return { min: 0, max, step: 10 };
}

function renderSingleSelectStep(contentEl, {
  prompt,
  lead,
  hint,
  options,
  selectedValue,
  onSelect,
  cardClass = "quickGoalGrid"
}) {
  const helperText = [
    lead ? `<p class="quickLead">${lead}</p>` : "",
    hint ? `<p class="quickHint">${hint}</p>` : ""
  ].join("");

  const optionHtml = options.map(({ value, label }) => (
    `<button type="button" class="quickGoalBtn ${selectedValue() === value ? "is-selected" : ""}" data-value="${value}" aria-pressed="false">${label}</button>`
  )).join("");

  contentEl.innerHTML = `
    <h2 class="quickPrompt">${prompt}</h2>
    ${helperText}
    <div class="quickAnswerArea">
      <div class="${cardClass}">
        ${optionHtml}
      </div>
    </div>
  `;

  const buttons = [...contentEl.querySelectorAll("[data-value]")];
  const syncPressedState = () => {
    buttons.forEach((node) => {
      const selected = node.dataset.value === selectedValue();
      node.classList.toggle("is-selected", selected);
      node.setAttribute("aria-pressed", String(selected));
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      onSelect(button.dataset.value);
      syncPressedState();
      goNext();
    });
  });

  syncPressedState();
}

function createSingleSelectStep({ key, prompt, lead, hint, options, getValue, setValue, validate }) {
  return {
    key,
    render(contentEl) {
      renderSingleSelectStep(contentEl, {
        prompt,
        lead,
        hint,
        options,
        selectedValue: getValue,
        onSelect: setValue
      });
      return { autoAdvance: true };
    },
    validate
  };
}

function stepGoal() {
  return createSingleSelectStep({
    key: "goal",
    prompt: "What are you trying to do today?",
    lead: "CreditCombo picks the best combo of credit cards to maximize rewards from your spending.",
    hint: "Pick your goal and get a simple plan in minutes.",
    options: [
      { value: "ideal_combo", label: "Find me the best possible CreditCombo" },
      { value: "current_cards", label: "Help me use my current cards better" }
    ],
    getValue: () => state.mode,
    setValue: (value) => {
      state.mode = resolveQuizMode(value);
      state.k = state.mode === "current_cards" ? 0 : Math.max(1, Number(state.k) || 1);
      state.quizResponses.goal = state.mode;
      refreshStepPlan();
    },
    validate: () => Boolean(state.mode)
  });
}

function stepSpend(cat) {
  return {
    key: `spend_${cat}`,
    render(contentEl) {
      const slider = spendSliderConfig(cat);
      const value = state.monthlySpend[cat] ?? "";
      const sliderValue = Math.min(slider.max, Math.max(slider.min, Number(value) || 0));
      const details = categoryDetailsFor(cat);
      const detailsMarkup = details
        ? `<details class="spendControl quickDetailsToggle" data-spend-control="more-details"><summary><span class="spendControlLabel">More details</span><span class="spendControlCaret" aria-hidden="true">▾</span></summary><div class="spendDetailsPanel quickDetailsPanel muted">${escapeHtml(details)}</div></details>`
        : "";
      contentEl.innerHTML = `
        <div class="quickPromptBlock quickPromptBlock--spend">
          <h2 class="quickPrompt">What is your average monthly spending on ${titleForCategory(cat)}?</h2>
          <p class="quickHint">Type an amount or use the slider.</p>
        </div>
        <div class="quickAnswerArea">
          ${detailsMarkup}
          <input id="quickSpendSlider" type="range" min="${slider.min}" max="${slider.max}" step="${slider.step}" value="${sliderValue}" />
          <div class="quickSliderBounds" aria-hidden="true">
            <span>$${slider.min}</span>
            <span>$${slider.max}</span>
          </div>
          <input id="quickSpendInput" class="quickBigInput" type="number" min="0" step="1" value="${value}" placeholder="0" />
        </div>
      `;

      const sliderInput = contentEl.querySelector("#quickSpendSlider");
      const input = contentEl.querySelector("#quickSpendInput");
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);

      const syncValue = (nextValue) => {
        const clamped = Math.min(slider.max, Math.max(slider.min, Number(nextValue) || 0));
        sliderInput.value = String(clamped);
      };

      sliderInput.addEventListener("input", () => {
        input.value = sliderInput.value;
        syncValue(sliderInput.value);
      });

      input.addEventListener("input", () => {
        syncValue(input.value);
      });

      const save = () => {
        const amount = Math.max(slider.min, Number(input.value) || 0);
        state.monthlySpend[cat] = amount;
        input.value = String(amount);
        syncValue(amount);
      };

      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        save();
        goNext();
      });

      return { beforeNext: save };
    },
    validate: () => true
  };
}

function stepCurrentCards() {
  return {
    key: "current_cards",
    render(contentEl) {
      const searchIndex = createCardSearchIndex(ctx.optimizationEligibleCards);

      contentEl.innerHTML = `
        <h2 class="quickPrompt">Which cards do you already have?</h2>
        <div class="quickAnswerArea">
          <div class="quickSearch">
          <input id="quickCardSearch" class="quickBigInput" type="search" placeholder="Type card or issuer name" autocomplete="off" />
          <div id="quickCardOptions" class="listBox hidden" role="listbox" aria-label="Matching cards"></div>
          <div id="quickCardPicks" class="chipList muted"></div>
          </div>
        </div>
      `;

      const input = contentEl.querySelector("#quickCardSearch");
      const optionsEl = contentEl.querySelector("#quickCardOptions");
      const picksEl = contentEl.querySelector("#quickCardPicks");

      const renderPicks = () => {
        picksEl.innerHTML = "";
        if (!state.lockedCardIds.length) {
          picksEl.textContent = "No cards selected yet.";
          return;
        }

        const frag = document.createDocumentFragment();
        state.lockedCardIds.forEach((id, index) => {
          const card = ctx.eligibleCardsById.get(id);
          if (!card) return;
          const chip = renderLockedChip(card);
          frag.append(chip);
          if (index < state.lockedCardIds.length - 1) frag.append(" ");
        });
        picksEl.append(frag);
      };

      const renderMatches = () => {
        const matches = rankCardMatches(searchIndex, input.value || "", {
          excludeCardIds: new Set(state.lockedCardIds),
          limit: 8
        });

        if (!matches.length) {
          optionsEl.classList.add("hidden");
          optionsEl.innerHTML = "";
          return;
        }

        optionsEl.classList.remove("hidden");
        renderCardSearchOptions(optionsEl, matches, {
          thumbClass: "thumb thumb-sm thumb-contain",
          dataAttribute: "cardId",
          getAriaLabel: (card) => `Add ${card.card_name}`
        });
      };

      const addCard = (cardId) => {
        if (!cardId || state.lockedCardIds.includes(cardId)) return;
        state.lockedCardIds.push(cardId);
        state.k = 0;
        input.value = "";
        renderPicks();
        renderMatches();
      };

      input.addEventListener("input", renderMatches);
      optionsEl.addEventListener("click", (event) => {
        const button = event.target.closest("[data-card-id]");
        if (!button) return;
        addCard(button.dataset.cardId);
      });

      picksEl.addEventListener("click", (event) => {
        const removeBtn = event.target.closest("[data-remove-id]");
        if (!removeBtn) return;
        state.lockedCardIds = state.lockedCardIds.filter((id) => id !== removeBtn.dataset.removeId);
        renderPicks();
        renderMatches();
      });

      bindCardSearchKeyboard(input, optionsEl, addCard);
      renderPicks();
      input.focus();
      return {};
    },
    validate: () => true
  };
}

function stepK() {
  return {
    key: "k",
    render(contentEl) {
      const value = Number.isFinite(state.k) ? Math.max(0, state.k) : 1;
      contentEl.innerHTML = `
        <h2 class="quickPrompt">What’s the maximum number of cards you’d want to carry with you?</h2>
        <div class="quickAnswerArea">
          <label class="quickLabel" for="quickK">Max cards to carry <span id="quickKValue" class="value-pill">${value}</span></label>
          <input id="quickK" type="range" min="0" max="5" step="1" value="${value}" />
        </div>
      `;

      const input = contentEl.querySelector("#quickK");
      const valueEl = contentEl.querySelector("#quickKValue");
      const sync = () => {
        state.k = Math.max(0, Number(input.value) || 0);
        valueEl.textContent = String(state.k);
      };

      input.addEventListener("input", sync);
      sync();
      return {};
    },
    validate: () => Number.isFinite(state.k)
  };
}

function stepValuation() {
  return createSingleSelectStep({
    key: "valuation",
    prompt: "How do you usually redeem rewards?",
    lead: "Pick the option that sounds most like you.",
    hint: "Choose one option to continue.",
    options: [
      { value: "estimated", label: "I look for great travel redemptions (higher upside)" },
      { value: "minimum_guaranteed", label: "I prefer statement credit / guaranteed value" }
    ],
    getValue: () => state.valuationMode,
    setValue: (value) => {
      state.valuationMode = value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
      state.quizResponses.valuation = state.valuationMode;
    },
    validate: () => Boolean(state.valuationMode)
  });
}

function createFlowByMode() {
  const spendSteps = ctx.schema.map((cat) => stepSpend(cat));
  return {
    current_cards: [stepCurrentCards(), stepValuation()],
    ideal_combo: [stepK(), stepValuation()],
    default: [stepK(), stepValuation()],
    spendSteps
  };
}

function buildSteps() {
  if (!state.mode) return [stepGoal()];
  const flow = createFlowByMode();
  const modeSteps = flow[state.mode] || flow.default;
  return [stepGoal(), ...flow.spendSteps, ...modeSteps];
}

function getProgressBounds() {
  const maxFlow = ctx.schema.length + 3;
  return { min: 1, max: maxFlow };
}

function refreshStepPlan() {
  visibleSteps = buildSteps();
  currentStepIndex = Math.min(currentStepIndex, visibleSteps.length - 1);
}

function updateProgress() {
  const { max } = getProgressBounds();
  const progressNow = Math.min(max, currentStepIndex + 1);
  const percent = Math.round((progressNow / max) * 100);

  const root = appEl.querySelector("#quickProgress");
  const bar = appEl.querySelector("#quickProgressBar");
  bar.style.width = `${percent}%`;
  root.setAttribute("aria-valuenow", String(progressNow));
  root.setAttribute("aria-valuemin", "1");
  root.setAttribute("aria-valuemax", String(max));
}

function goNext() {
  const step = visibleSteps[currentStepIndex];
  if (!step?.validate()) return;

  trackEvent("quick_setup_step_completed", {
    step_key: step?.key || `step_${currentStepIndex + 1}` ,
    step_index: currentStepIndex + 1
  });

  if (currentStepIndex >= visibleSteps.length - 1) {
    trackEvent("quick_setup_completed", { mode: selectedMode() });
    showPostQuizResults();
    return;
  }

  currentStepIndex += 1;
  renderWizard();
}

function goBack() {
  if (state.view === "results") {
    state.view = "quiz";
    state.results = null;
    renderWizard();
    return;
  }

  if (currentStepIndex <= 0) return;
  currentStepIndex -= 1;
  renderWizard();
}

function selectedMode() {
  if (resolveQuizMode(state.mode) === "current_cards") return "current_cards";
  if (state.quizResponses?.goal === "current_cards") return "current_cards";
  return "ideal_combo";
}

function selectedValuationMode() {
  return state.valuationMode || "estimated";
}


function postQuizHeroContent(mode) {
  if (mode === "current_cards") {
    return {
      eyebrow: "Your current setup",
      title: "Here’s your current combo",
      lead: "A practical baseline from the cards you already hold."
    };
  }

  return {
    eyebrow: "Your optimized outcome",
    title: "Welcome to your CreditCombo",
    lead: "Your highest-upside combo for stronger annual rewards."
  };
}

function buildOptimizationPayload(overrides = {}) {
  const mode = overrides.mode || selectedMode();
  const lockedCardIds = overrides.lockedCardIds || (mode === "current_cards" ? state.lockedCardIds : []);
  const k = Number.isFinite(overrides.k) ? overrides.k : (mode === "current_cards" ? 0 : Math.max(1, Number(state.k) || 1));

  return {
    cards: ctx.optimizationEligibleCards,
    programsMap: ctx.programsMap,
    schema: ctx.schema,
    annualSpend: annualizeMonthlySpend(state.monthlySpend, ctx.schema),
    subcategorySpend: state.subcategorySpend,
    subcategoryConfigs: ctx.subcategoryConfigs,
    valuationMode: selectedValuationMode(),
    lockedCardIds,
    k
  };
}

function computeScenarioResult(overrides = {}) {
  const payload = buildOptimizationPayload(overrides);
  const best = findBestCombo(payload);
  const chexySummary = chexyAdjustedAnnualSpend({
    annualSpend: payload.annualSpend,
    monthlySpend: state.monthlySpend,
    subcategorySpend: state.subcategorySpend,
    subcategoryConfigs: ctx.subcategoryConfigs,
    chexyFeePercent: Number(window.CHEXY_FEE_PERCENT ?? 0)
  });
  return { best, payload, chexySummary };
}

async function showPostQuizResults() {
  if (selectedMode() === "current_cards") state.k = 0;
  state.view = "results";
  state.resultsLoading = true;
  state.results = null;
  renderWizard();

  await Promise.all([
    new Promise((resolve) => requestAnimationFrame(resolve)),
    new Promise((resolve) => setTimeout(resolve, 600))
  ]);

  const currentMode = selectedMode();
  const current = computeScenarioResult({ mode: currentMode });
  let uplift = null;

  if (currentMode === "current_cards") {
    const ideal = computeScenarioResult({ mode: "ideal_combo", lockedCardIds: [], k: 5 });
    uplift = Number(ideal.best.net || 0) - Number(current.best.net || 0);
  }

  state.results = {
    ...current,
    uplift
  };
  state.resultsLoading = false;

  renderWizard();
}

function renderPostQuizScreen() {
  const currentMode = selectedMode();
  const hero = postQuizHeroContent(currentMode);
  const isLoading = state.resultsLoading;
  const resultState = isLoading ? null : (state.results || computeScenarioResult({ mode: currentMode }));
  const { best, payload, chexySummary, uplift } = resultState || {};

  const heroMarkup = isLoading ? "" : `
      <header class="quickResultsHero ${currentMode === "current_cards" ? "is-current" : "is-ideal"}">
        <p class="quickHint">${hero.eyebrow}</p>
        <h2 class="quickPrompt">${hero.title}</h2>
        <p class="quickLead">${hero.lead}</p>
      </header>
  `;

  appEl.innerHTML = `
    <section class="quickResultsScreen">
      ${heroMarkup}
      <p id="quickResultsCallout" class="earnRateCallout quickUpliftCallout"></p>
      <section class="panel resultPanel quickSetupResultShell">
        <div class="panelHeader panelHeader-result">
          <h2>Results</h2>
        </div>
        <div class="divider"></div>
        <div id="result" class="quickSetupResultPanel ${isLoading ? "is-loading" : ""}"></div>
      </section>
      <div class="quickActions quickResultsActions">
        <button type="button" id="quickOpenOptimizer" class="primary">Open in Optimizer</button>
        <button type="button" id="quickEditAnswers">Edit answers</button>
      </div>
    </section>
  `;

  const calloutEl = appEl.querySelector("#quickResultsCallout");
  if (!isLoading && currentMode === "current_cards") {
    const upliftValue = Number(uplift || 0);
    calloutEl.classList.remove("hidden");
    calloutEl.textContent = upliftValue > 0
      ? `On this spend, your ideal CreditCombo would earn you +${formatMoneyCAD(upliftValue)}/year more.`
      : "Your current setup is already close to your upside for this spend profile.";
  } else {
    calloutEl.classList.add("hidden");
  }

  const resultPanelEl = appEl.querySelector("#result");
  if (isLoading) {
    resultPanelEl.innerHTML = `
      <div class="loadingState" role="status" aria-live="polite">
        <span class="loadingSpinner" aria-hidden="true"></span>
        <span>Building your CreditCombo…</span>
      </div>
    `;
  } else {
    renderResult(resultPanelEl, best, payload.annualSpend, payload.schema, payload.valuationMode, chexySummary, ctx.subcategoryConfigs);
  }

  const shareBtn = resultPanelEl.querySelector("[data-share-launch]");
  shareBtn?.addEventListener("click", () => {
    trackEvent("quick_setup_share_clicked", { source: "share_button" });
    const shareContext = buildShareContext(best, chexySummary, window.location.href);
    if (!shareContext) return;
    const overlay = ensureShareOverlay();
    overlay.updateContext(shareContext);
    overlay.open();
  });

  appEl.querySelector("#quickOpenOptimizer").addEventListener("click", () => {
    trackEvent("quick_setup_open_optimizer_clicked", { mode: currentMode });
    // TODO: add country capture once country-based card eligibility is implemented.
    // TODO: add credit score gating once credit-tier constraints are supported.
    // TODO: add income-based filtering once card income requirements are integrated.
    const deepLinkState = {
      ...state,
      mode: currentMode,
      k: currentMode === "current_cards" ? 0 : Math.max(1, Number(state.k) || 1),
      valuationMode: selectedValuationMode()
    };
    window.location.assign(buildOptimizerDeepLink(deepLinkState));
  });

  appEl.querySelector("#quickEditAnswers").addEventListener("click", () => {
    trackEvent("quick_setup_edit_answers_clicked", { mode: currentMode });
    state.view = "quiz";
    renderWizard();
  });
}

function renderWizard() {
  if (state.view === "results") {
    renderPostQuizScreen();
    return;
  }

  const step = visibleSteps[currentStepIndex];
  const stepSignature = `${step?.key || "step"}:${currentStepIndex + 1}`;
  if (stepSignature !== lastTrackedStepView) {
    lastTrackedStepView = stepSignature;
    trackEvent("quick_setup_step_viewed", {
      step_key: step?.key || `step_${currentStepIndex + 1}` ,
      step_index: currentStepIndex + 1
    });
  }

  appEl.innerHTML = `
    <div id="quickProgress" class="quickProgress" role="progressbar">
      <div id="quickProgressBar" class="quickProgressBar"></div>
    </div>
    <div id="quickContent" class="quickContent"></div>
    <div class="quickActions">
      <button type="button" id="quickBack">Back</button>
      <button type="button" id="quickNext" class="primary">Next</button>
    </div>
  `;

  updateProgress();

  const contentEl = appEl.querySelector("#quickContent");
  const { beforeNext = null, autoAdvance = false } = step.render(contentEl) || {};

  const backBtn = appEl.querySelector("#quickBack");
  const nextBtn = appEl.querySelector("#quickNext");
  const actionsEl = appEl.querySelector(".quickActions");

  const showBack = currentStepIndex > 0;
  const showNext = !autoAdvance;

  backBtn.classList.toggle("hidden", !showBack);
  backBtn.addEventListener("click", goBack);

  nextBtn.classList.toggle("hidden", !showNext);
  nextBtn.addEventListener("click", () => {
    if (typeof beforeNext === "function") beforeNext();
    goNext();
  });

  actionsEl.classList.toggle("hidden", !(showBack || showNext));
}

function renderInitializationError(error) {
  const errorMessage = error && typeof error.message === "string"
    ? error.message
    : "Unknown setup error";

  appEl.innerHTML = `
    <section class="panel" role="alert" aria-live="assertive">
      <h2>Quick setup is temporarily unavailable</h2>
      <p>We couldn't load the data needed to start this flow. Please try again in a moment.</p>
      <p class="muted">Support details: ${escapeHtml(errorMessage)}</p>
      <div class="quickActions">
        <button type="button" id="quickSetupRetry" class="primary">Retry</button>
      </div>
    </section>
  `;

  appEl.querySelector("#quickSetupRetry")?.addEventListener("click", () => {
    trackEvent("quick_setup_retry_clicked");
    window.location.reload();
  });
}

async function main() {
  trackPageView("quick_setup");
  trackEvent("session_started", sessionEntryContext());
  trackEvent("quick_setup_started");

  const data = await loadOptimizerData();
  const optimizationEligibleCards = QUICK_SETUP_DEFAULTS.includeBusinessCards
    ? data.eligibleCards
    : data.eligibleCards.filter((card) => !card.is_business_card);

  ctx = {
    ...data,
    optimizationEligibleCards,
    eligibleCardsById: new Map(optimizationEligibleCards.map((card) => [card.id, card]))
  };

  refreshStepPlan();
  renderWizard();
}

main().catch((error) => {
  console.error("Quick setup failed to initialize", error);
  renderInitializationError(error);
});
