import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";
import { createOptimizerController } from "./optimizer-controller.js";
import { renderSpendTable, readMonthlySpend, renderComparisonResult, renderResult } from "./ui.js";
import { readComparisonQueue, writeComparisonQueue } from "./compare-queue.js";

const state = {
  schema: [],
  eligibleCards: [],
  byId: new Map(),
  left: null,
  right: null,
  leftResult: null,
  rightResult: null
};

function el(id) {
  return document.getElementById(id);
}

function updateComparison() {
  renderComparisonResult(el("comparisonResult"), state.leftResult, state.rightResult, state.schema);
}

function sideElements(prefix) {
  return {
    runBtn: el(`${prefix}RunBtn`),
    result: el(`${prefix}Result`),
    valuationMode: el(`${prefix}ValuationMode`),
    excludeFeeCards: el(`${prefix}ExcludeFeeCards`),
    enableLockedCards: el(`${prefix}EnableLockedCards`),
    lockedCardsPanel: el(`${prefix}LockedCardsPanel`),
    lockedCardSearch: el(`${prefix}LockedCardSearch`),
    lockedCardOptions: el(`${prefix}LockedCardOptions`),
    lockedCardPicks: el(`${prefix}LockedCardPicks`),
    lockedCardsDivider: el(`${prefix}LockedCardsDivider`),
    kInput: el(`${prefix}K`),
    kValue: el(`${prefix}KValue`),
    kLabel: el(`${prefix}KLabel`),
    autoFillBtn: el(`${prefix}AutoFillBtn`)
  };
}

function wireDragBetweenSides() {
  for (const side of ["left", "right"]) {
    const picks = el(`${side}LockedCardPicks`);
    picks?.addEventListener("dragstart", (event) => {
      const chip = event.target.closest("[data-locked-card-id]");
      if (!chip) return;
      event.dataTransfer.setData("text/plain", chip.dataset.lockedCardId);
      event.dataTransfer.setData("application/x-side", side);
    });
  }

  for (const side of ["left", "right"]) {
    const zone = el(`${side}DropZone`);
    zone?.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("dragOver"); });
    zone?.addEventListener("dragleave", () => zone.classList.remove("dragOver"));
    zone?.addEventListener("drop", (event) => {
      zone.classList.remove("dragOver");
      event.preventDefault();
      const from = event.dataTransfer.getData("application/x-side");
      const cardId = event.dataTransfer.getData("text/plain");
      if (!from || !cardId || from === side) return;
      const sourceController = from === "left" ? state.left : state.right;
      const targetController = side === "left" ? state.left : state.right;
      sourceController.moveLockedCardTo(cardId, targetController);
    });
  }
}

function renderQueuePanel() {
  const queueIds = readComparisonQueue().filter((id) => state.byId.has(id));
  const host = el("queuedCards");
  if (!queueIds.length) {
    host.innerHTML = '<p class="muted">No cards queued from browser yet.</p>';
    return;
  }

  host.innerHTML = queueIds
    .map((id) => {
      const card = state.byId.get(id);
      return `<div class="queueRow"><span>${card.card_name} <span class="muted">(${card.issuer})</span></span><span><button class="secondary" data-send-left="${id}">Send to left</button> <button class="secondary" data-send-right="${id}">Send to right</button></span></div>`;
    })
    .join("");
}

function addQueuedCard(side, cardId) {
  const controller = side === "left" ? state.left : state.right;
  const current = controller.getLockedCardIds();
  if (!current.includes(cardId)) controller.setLockedCards([...current, cardId], { enable: true });
}

function bindQueueEvents() {
  el("queuedCards").addEventListener("click", (event) => {
    const leftBtn = event.target.closest("[data-send-left]");
    const rightBtn = event.target.closest("[data-send-right]");
    if (leftBtn) addQueuedCard("left", leftBtn.dataset.sendLeft);
    if (rightBtn) addQueuedCard("right", rightBtn.dataset.sendRight);
  });

  el("clearQueueBtn").addEventListener("click", () => {
    writeComparisonQueue([]);
    renderQueuePanel();
  });
}

async function init() {
  const [cardsJson, programsJson] = await Promise.all([
    loadJson("./data/cards.json"),
    loadJson("./data/programs.json")
  ]);

  const programsMap = normalizePrograms(programsJson);
  const { schema, categoryDescriptions, eligibleCards } = validateAndFilterCards(cardsJson, programsMap);
  state.schema = schema;
  state.eligibleCards = eligibleCards;
  state.byId = new Map(eligibleCards.map((card) => [card.id, card]));

  renderSpendTable(el("sharedSpendTable"), schema, categoryDescriptions);

  state.left = createOptimizerController({
    eligibleCards,
    programsMap,
    schema,
    elements: sideElements("left"),
    readMonthlySpend: () => readMonthlySpend(schema),
    onResult: (result) => {
      state.leftResult = result;
      renderResult(el("leftResult"), result.best, result.annualSpend, schema, result.valuationMode);
      updateComparison();
    },
    onStateChange: updateComparison,
    allowZeroCards: true,
    lockBehavior: "seed_total"
  });

  state.right = createOptimizerController({
    eligibleCards,
    programsMap,
    schema,
    elements: sideElements("right"),
    readMonthlySpend: () => readMonthlySpend(schema),
    onResult: (result) => {
      state.rightResult = result;
      renderResult(el("rightResult"), result.best, result.annualSpend, schema, result.valuationMode);
      updateComparison();
    },
    onStateChange: updateComparison,
    allowZeroCards: true,
    lockBehavior: "seed_total"
  });

  state.left.init();
  state.right.init();
  wireDragBetweenSides();
  renderQueuePanel();
  bindQueueEvents();

  el("sharedSpendTable").addEventListener("input", () => {
    state.left.runOptimizer();
    state.right.runOptimizer();
  });

  state.left.runOptimizer();
  state.right.runOptimizer();
}

init().catch((error) => {
  const fatal = el("compareFatal");
  fatal.classList.remove("hidden");
  fatal.textContent = `Error loading comparison page: ${error?.message || "Unknown error"}`;
});
