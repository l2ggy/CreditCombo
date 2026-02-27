import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";
import { createOptimizerController } from "./optimizer-controller.js";
import { clearCompareQueue, getCompareQueue, removeFromCompareQueue } from "./compare-queue.js";
import { clampInt, renderComparisonResult, renderSpendTable, readMonthlySpend, renderResult } from "./ui.js";

const els = {
  status: document.getElementById("status"),
  sharedSpendTable: document.getElementById("sharedSpendTable"),
  comparisonResult: document.getElementById("comparisonResult"),
  compareFatal: document.getElementById("compareFatal"),
  queuedCards: document.getElementById("queuedCards"),
  clearQueueBtn: document.getElementById("clearQueueBtn")
};

function sideElements(side) {
  return {
    result: document.getElementById(`${side}Result`),
    runBtn: document.getElementById(`${side}OptimizeBtn`),
    k: document.getElementById(`${side}K`),
    kValue: document.getElementById(`${side}KValue`),
    valuationMode: document.getElementById(`${side}ValuationMode`),
    excludeFeeCards: document.getElementById(`${side}ExcludeFeeCards`),
    excludeBusinessCards: document.getElementById(`${side}ExcludeBusinessCards`),
    search: document.getElementById(`${side}Search`),
    options: document.getElementById(`${side}Options`),
    picks: document.getElementById(`${side}Picks`),
    dropZone: document.getElementById(`${side}DropZone`)
  };
}

async function init() {
  const [cardsJson, programsJson] = await Promise.all([loadJson("./data/cards.json"), loadJson("./data/programs.json")]);
  const programsMap = normalizePrograms(programsJson);
  const { schema, categoryDescriptions, eligibleCards } = validateAndFilterCards(cardsJson, programsMap);
  const cardsById = new Map(eligibleCards.map((c) => [c.id, c]));
  const validIds = new Set(eligibleCards.map((c) => c.id));

  const left = createSide("left", createOptimizerController({ cards: eligibleCards, programsMap, schema }), cardsById, schema);
  const right = createSide("right", createOptimizerController({ cards: eligibleCards, programsMap, schema }), cardsById, schema);

  renderSpendTable(els.sharedSpendTable, schema, categoryDescriptions);
  els.status.innerHTML = `<span class="badge good">Loaded</span> <span class="muted">${eligibleCards.length} eligible cards</span>`;

  function rerunBoth() {
    const monthlySpend = readMonthlySpend(schema);
    left.run(monthlySpend);
    right.run(monthlySpend);
    if (left.lastResult && right.lastResult) {
      renderComparisonResult(els.comparisonResult, left.lastResult, right.lastResult, schema, left.currentValuation());
    } else {
      els.comparisonResult.innerHTML = "";
    }
  }

  els.sharedSpendTable.addEventListener("input", rerunBoth);

  function renderQueue() {
    const queue = getCompareQueue(validIds);
    if (!queue.length) {
      els.queuedCards.innerHTML = '<p class="muted">No queued cards yet. Add cards from the browser page.</p>';
      return;
    }

    els.queuedCards.innerHTML = queue.map((id) => {
      const card = cardsById.get(id);
      if (!card) return "";
      return `<div class="queueItem"><span>${card.card_name}</span><div class="queueActions"><button data-send-left="${id}">Send to left</button><button data-send-right="${id}">Send to right</button><button data-remove="${id}">Remove</button></div></div>`;
    }).join("");
  }

  els.queuedCards.addEventListener("click", (event) => {
    const leftBtn = event.target.closest("[data-send-left]");
    const rightBtn = event.target.closest("[data-send-right]");
    const removeBtn = event.target.closest("[data-remove]");
    if (leftBtn) left.addCard(leftBtn.dataset.sendLeft);
    if (rightBtn) right.addCard(rightBtn.dataset.sendRight);
    if (removeBtn) removeFromCompareQueue(removeBtn.dataset.remove, validIds);
    renderQueue();
    rerunBoth();
  });

  els.clearQueueBtn?.addEventListener("click", () => {
    clearCompareQueue();
    renderQueue();
  });

  setupCrossSideTransfer(left, right, rerunBoth);
  setupCrossSideTransfer(right, left, rerunBoth);

  renderQueue();
  rerunBoth();
}

function createSide(side, controller, cardsById, schema) {
  const els = sideElements(side);
  const selected = new Set();
  const state = { lastResult: null };

  function currentValuation() {
    return els.valuationMode?.value === "minimum_guaranteed" ? "minimum_guaranteed" : "estimated";
  }

  function renderPicks() {
    if (!selected.size) {
      els.picks.innerHTML = '<p class="muted">No manual cards selected. Leave empty and click Optimize combo for a fully optimal combo.</p>';
      return;
    }

    els.picks.innerHTML = [...selected].map((id) => {
      const card = cardsById.get(id);
      if (!card) return "";
      return `<span class="lockedChip" draggable="true" data-drag-id="${id}">${card.card_name}<button type="button" class="lockedChipRemove" data-remove-id="${id}">×</button><button type="button" data-move-other="${id}">Move to other side</button></span>`;
    }).join(" ");
  }

  function searchMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...cardsById.values()].filter((card) => !selected.has(card.id) && `${card.card_name} ${card.issuer}`.toLowerCase().includes(q)).slice(0, 8);
  }

  function renderOptions() {
    const matches = searchMatches(els.search.value || "");
    els.options.innerHTML = matches.map((card) => `<button type="button" class="lockedOption" data-add-id="${card.id}">${card.card_name} <span class="muted">(${card.issuer})</span></button>`).join("");
    els.options.classList.toggle("hidden", matches.length === 0);
  }

  function run(monthlySpend) {
    const result = controller.run({
      monthlySpend,
      valuationMode: currentValuation(),
      targetCardCount: clampInt(els.k.value, 0, 5),
      targetMode: "total",
      manualCardIds: [...selected],
      manualEnabled: true,
      excludeFeeCards: Boolean(els.excludeFeeCards?.checked),
      excludeBusinessCards: Boolean(els.excludeBusinessCards?.checked)
    });

    els.kValue.textContent = els.k.value;
    renderResult(els.result, result.best, result.annualSpend, schema, currentValuation());
    state.lastResult = result;
  }

  els.search?.addEventListener("input", renderOptions);
  els.options?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-add-id]");
    if (!btn) return;
    selected.add(btn.dataset.addId);
    els.search.value = "";
    renderOptions();
    renderPicks();
  });

  els.picks?.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-remove-id]");
    if (removeBtn) {
      selected.delete(removeBtn.dataset.removeId);
      renderPicks();
      return;
    }
  });

  [els.k, els.valuationMode, els.excludeFeeCards, els.excludeBusinessCards].forEach((el) => el?.addEventListener("change", () => run(readMonthlySpend(schema))));
  els.runBtn?.addEventListener("click", () => run(readMonthlySpend(schema)));

  renderPicks();
  renderOptions();

  return {
    addCard: (id) => { if (cardsById.has(id)) { selected.add(id); renderPicks(); } },
    removeCard: (id) => { selected.delete(id); renderPicks(); },
    hasCard: (id) => selected.has(id),
    run,
    get lastResult() { return state.lastResult; },
    currentValuation,
    elements: els
  };
}

function setupCrossSideTransfer(source, target, rerunBoth) {
  source.elements.picks?.addEventListener("dragstart", (event) => {
    const chip = event.target.closest("[data-drag-id]");
    if (!chip) return;
    event.dataTransfer?.setData("text/plain", chip.dataset.dragId);
  });

  source.elements.picks?.addEventListener("click", (event) => {
    const moveBtn = event.target.closest("[data-move-other]");
    if (!moveBtn) return;
    const id = moveBtn.dataset.moveOther;
    source.removeCard(id);
    target.addCard(id);
    rerunBoth();
  });

  target.elements.dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    target.elements.dropZone.classList.add("dropZoneActive");
  });

  target.elements.dropZone?.addEventListener("dragleave", () => {
    target.elements.dropZone.classList.remove("dropZoneActive");
  });

  target.elements.dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    target.elements.dropZone.classList.remove("dropZoneActive");
    const id = event.dataTransfer?.getData("text/plain");
    if (!id || target.hasCard(id)) return;
    if (!source.hasCard(id)) return;
    target.addCard(id);
    source.removeCard(id);
    rerunBoth();
  });
}

init().catch((error) => {
  els.compareFatal.classList.remove("hidden");
  els.compareFatal.textContent = `Error loading comparison page: ${error?.message || "Unknown"}`;
});
