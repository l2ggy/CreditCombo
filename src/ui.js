import { formatMoneyCAD } from "./shared/format.js";
import { escapeHtml } from "./shared/sanitize.js";
import { renderCardThumb, renderResultCardItem } from "./shared/render.js";

export function clampInt(n, lo, hi) {
  n = Math.floor(Number(n) || lo);
  return Math.max(lo, Math.min(hi, n));
}

export function renderSpendTable(el, schema, categoryDescriptions = {}, subcategoryConfigs = {}) {
  el.innerHTML = `
    <div class="spendGrid" role="group" aria-label="Monthly spend by category">
      ${schema.map((cat) => spendRowMarkup(cat, categoryDescriptions[cat] || "", subcategoryConfigs[cat] || [])).join("")}
    </div>
  `;

  bindSpendRowDetailsControls(el);

  const spendTotalEl = document.getElementById("spendTotal");

  const updateSpendTotal = (changedInput = null) => {
    syncParentSpendFromSubcategories(el, subcategoryConfigs, changedInput);

    const total = [...el.querySelectorAll("input[data-cat]")].reduce((sum, input) => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) return sum;
      return sum + value;
    }, 0);

    if (spendTotalEl) {
      spendTotalEl.textContent = `Total monthly spend: ${formatMoneyCAD(total, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
  };

  el.querySelectorAll("input[data-cat], input[data-subcategory-key]").forEach((inp) => {
    inp.addEventListener("input", () => updateSpendTotal(inp));

    inp.addEventListener("focus", () => {
      if (inp.value === "0") inp.select();
    });

    inp.addEventListener("blur", () => updateSpendTotal(inp));
  });


  updateSpendTotal();
}


function syncParentSpendFromSubcategories(el, subcategoryConfigs = {}, changedInput = null) {
  for (const [parentCategory, configs] of Object.entries(subcategoryConfigs || {})) {
    if (!configs?.length) continue;

    const parentInput = el.querySelector(`input[data-cat="${cssEscape(parentCategory)}"]`);
    if (!parentInput) continue;

    const subcategoryInputs = configs.map((config) =>
      el.querySelector(`input[data-subcategory-key="${cssEscape(config.key)}"]`)
    ).filter(Boolean);

    const subcategoryTotal = subcategoryInputs.reduce((sum, input) => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) return sum;
      return sum + value;
    }, 0);

    const parentValue = Number(parentInput.value);
    const safeParentValue = Number.isFinite(parentValue) && parentValue >= 0 ? parentValue : 0;

    const parentWasEdited = changedInput?.dataset?.cat === parentCategory;
    if (parentWasEdited && subcategoryTotal > safeParentValue) {
      let overflow = subcategoryTotal - safeParentValue;
      for (let idx = subcategoryInputs.length - 1; idx >= 0 && overflow > 1e-9; idx--) {
        const input = subcategoryInputs[idx];
        const value = Number(input.value);
        const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
        if (safeValue <= 0) continue;
        const reduction = Math.min(safeValue, overflow);
        const nextValue = safeValue - reduction;
        input.value = nextValue > 0 ? String(Math.round(nextValue)) : "";
        overflow -= reduction;
      }
      continue;
    }

    if (subcategoryTotal > safeParentValue) parentInput.value = String(Math.round(subcategoryTotal));
  }
}

export function readMonthlySpend(schema) {
  const spend = {};
  const schemaSet = new Set(schema);

  document.querySelectorAll("input[data-cat]").forEach((inp) => {
    const cat = inp.dataset.cat;
    if (!schemaSet.has(cat)) return;

    const value = Number(inp.value);
    spend[cat] = Number.isFinite(value) && value >= 0 ? value : 0;
  });

  return spend;
}

export function readSubcategoryMonthlySpend(subcategoryConfigs = {}) {
  const spend = {};
  const validKeys = new Set(Object.values(subcategoryConfigs).flat().map((config) => config.key));

  document.querySelectorAll("input[data-subcategory-key]").forEach((input) => {
    const key = input.dataset.subcategoryKey;
    if (!validKeys.has(key)) return;
    const value = Number(input.value);
    spend[key] = Number.isFinite(value) && value > 0 ? value : 0;
  });

  return spend;
}


export function resetSubcategorySpend(key) {
  if (!key) return;
  document.querySelectorAll(`[data-subcategory-key="${cssEscape(key)}"]`).forEach((input) => {
    input.value = "";
  });
}

export function renderIssues(el, issues) {
  if (!issues.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <ul>
      ${issues.slice(0, 25).map(i => `<li><b>${escapeHtml(i.card)}</b>: ${escapeHtml(i.reason)}</li>`).join("")}
      ${issues.length > 25 ? `<li>… (${issues.length - 25} more)</li>` : ""}
    </ul>
  `;
}

export function renderResult(el, best, annualSpend, schema, valuationMode = "estimated", chexySummary = null, subcategoryConfigs = {}) {
  el.classList.remove("hidden");
  el.classList.remove("resultEmpty");
  el.innerHTML = "";

  const resultContent = document.createElement("div");
  resultContent.className = "resultContent resultContent--enter";
  el.append(resultContent);

  if (!best.combo.length) {
    const badge = document.createElement("span");
    badge.className = "badge bad";
    badge.textContent = "No result";
    resultContent.append(badge, " No eligible cards found.");
    return;
  }

  const comboHeading = document.createElement("h2");
  comboHeading.textContent = "Best combo";
  resultContent.append(comboHeading);

  const comboList = document.createElement("ul");
  comboList.className = "listClean";
  best.combo.forEach((card) => comboList.append(renderResultCardItem(card)));
  resultContent.append(comboList);

  const valueHeading = document.createElement("h2");
  valueHeading.textContent = `Annual value (${valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated"})`;
  resultContent.append(valueHeading);

  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  const totalAnnualSpend = schema.reduce((sum, cat) => sum + (annualSpend[cat] || 0), 0);
  const cardAnnualFees = Number(best.fees || 0);
  const chexyFeeCost = Number(chexySummary?.chexyAdjustedAnnualSpend || 0);
  const netAfterChexy = best.net - chexyFeeCost;
  const totalSpendWithFees = totalAnnualSpend + cardAnnualFees + chexyFeeCost;
  const effectiveEarnRate = totalSpendWithFees > 0 ? netAfterChexy / totalSpendWithFees : null;
  const grossEarnRate = totalAnnualSpend > 0 ? best.gross / totalAnnualSpend : null;

  const rows = [["Gross rewards value", formatMoneyCAD(best.gross)]];
  if (cardAnnualFees > 0) rows.push(["Card annual fees", formatMoneyCAD(cardAnnualFees)]);
  if (chexyFeeCost > 0) rows.push(["Chexy fees", formatMoneyCAD(chexyFeeCost)]);
  rows.push(["Net value", formatMoneyCAD(netAfterChexy)]);

  rows.forEach(([label, value], idx) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = label;
    const td = document.createElement("td");

    if (idx === rows.length - 1) {
      const b = document.createElement("b");
      b.textContent = value;
      td.append(b);
    } else {
      td.textContent = value;
    }

    tr.append(th, td);
    tbody.append(tr);
  });

  table.append(tbody);
  resultContent.append(table);

  const effectiveRateCallout = document.createElement("p");
  effectiveRateCallout.className = "earnRateCallout";
  effectiveRateCallout.textContent = `Earn rate: ${formatPercent(effectiveEarnRate)}`;
  resultContent.append(effectiveRateCallout);

  const chexyCallout = renderChexyWorthItCallout(chexySummary, grossEarnRate);
  if (chexyCallout) resultContent.append(chexyCallout);

  const divider = document.createElement("div");
  divider.className = "divider divider-tight";
  resultContent.append(divider);

  const useHeading = document.createElement("h2");
  useHeading.className = "useHeading";
  useHeading.textContent = "Which card to use";
  resultContent.append(useHeading);

  const instructions = [];
  let useCardDescIndex = 0;

  const subcategoryKeysByParent = Object.fromEntries(
    Object.entries(subcategoryConfigs || {}).map(([parentCategory, configs]) => [
      parentCategory,
      (configs || []).map((config) => `subcategory_${config.key}`)
    ])
  );

  for (const cat of schema) {
    const total = annualSpend[cat] || 0;
    if (total <= 0) continue;

    const allocByCard = new Map();

    best.combo.forEach((card) => {
      const baseAmount = Number(best.assigned?.[card.id]?.[cat] || 0);
      const subcategoryAmount = (subcategoryKeysByParent[cat] || [])
        .reduce((sum, subcategoryKey) => sum + Number(best.assigned?.[card.id]?.[subcategoryKey] || 0), 0);
      const totalAmount = baseAmount + subcategoryAmount;
      if (totalAmount > 1e-6) allocByCard.set(card.id, { card, amt: totalAmount });
    });

    const alloc = [...allocByCard.values()]
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 3);

    if (!alloc.length) continue;

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.setAttribute("role", "listitem");

    const category = document.createElement("div");
    category.className = "mono tileTitle";
    category.textContent = cat;
    tile.append(category);

    const stack = document.createElement("div");
    stack.className = alloc.length > 1 ? "tileMedia tileMedia-stack" : "tileMedia tileMedia-single";
    stack.style.setProperty("--stack-count", String(alloc.length));

    alloc.forEach(({ card, amt }, idx) => {
      const amountPart = alloc.length > 1 ? ` — ${formatMoneyCAD(amt)}` : "";
      const label = `${card.card_name}${amountPart}`;
      const descId = `use-card-desc-${useCardDescIndex}`;
      useCardDescIndex += 1;

      const thumb = document.createElement("span");
      thumb.className = "tileThumb";
      thumb.style.setProperty("--stack-index", String(idx));
      thumb.title = label;
      thumb.dataset.card = label;
      thumb.tabIndex = 0;
      thumb.setAttribute("role", "img");
      thumb.setAttribute("aria-label", card.card_name);
      thumb.setAttribute("aria-describedby", descId);

      const desc = document.createElement("span");
      desc.id = descId;
      desc.className = "srOnly";
      desc.textContent = `Use ${label} for ${cat}.`;

      thumb.append(desc);
      thumb.append(renderCardThumb(card, { className: "thumb thumb-lg thumb-contain", withFrame: false }));
      stack.append(thumb);
    });

    tile.append(stack);
    instructions.push(tile);
  }

  const useCols = Math.min(4, Math.max(1, instructions.length));
  const useGrid = document.createElement("div");
  useGrid.className = "tileGrid";
  useGrid.setAttribute("role", "list");
  useGrid.setAttribute("aria-label", "Card to use by category");
  useGrid.style.setProperty("--use-cols", String(useCols));

  if (!instructions.length) {
    const none = document.createElement("p");
    none.className = "muted";
    none.textContent = "No spend entered.";
    useGrid.append(none);
  } else {
    instructions.forEach((tile) => useGrid.append(tile));
  }

  resultContent.append(useGrid);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}


function renderChexyWorthItCallout(chexySummary, effectiveEarnRate) {
  if (!chexySummary?.chexyBaseAnnualSpend || chexySummary.chexyBaseAnnualSpend <= 0) return null;

  const chargedAnnual = Number(chexySummary.chexyChargedAnnualSpend || 0);
  const rewardsValue = Number.isFinite(effectiveEarnRate) ? chargedAnnual * effectiveEarnRate : 0;
  const fee = Number(chexySummary.chexyAdjustedAnnualSpend || 0);
  const netLift = rewardsValue - fee;

  const line = document.createElement("p");
  line.className = "muted chexyWorthIt";
  const verdict = netLift >= 0 ? "Chexy is worth it" : "Chexy is not worth it";
  line.textContent = `${verdict}: ${formatMoneyCAD(netLift)} after fees`;
  return line;
}

function spendRowMarkup(category, desc, subcategories) {
  const moreDetails = moreDetailsControlMarkup(category, desc, subcategories);

  return `
    <div class="spendRow" data-spend-row data-cat-row="${escapeHtml(category)}">
      <div class="spendRowTop">
        <div class="spendMeta">
          <span class="mono spendCat">${escapeHtml(category)}</span>
          ${moreDetails.control ? `<div class="spendMetaControls">${moreDetails.control}</div>` : ""}
        </div>
        <div class="spendInputWrap">
          <label class="srOnly" for="spend-${escapeHtml(category)}">Spend for ${escapeHtml(category)}</label>
          <input id="spend-${escapeHtml(category)}" class="spend-input" type="number" min="0" step="1" value="" placeholder="0" data-cat="${escapeHtml(category)}" aria-label="Spend for ${escapeHtml(category)}" />
        </div>
      </div>
      ${moreDetails.panel}
    </div>
  `;
}

function detailsPanelMarkup(desc) {
  const clean = String(desc || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return `<div class="spendDetailsPanel muted">${escapeHtml(clean)}</div>`;
}

function subcategoryPanelMarkup(parentCategory, configs) {
  if (!configs.length) return "";

  const subcategoryItems = configs.map((config) => {
    const label = escapeHtml(config.label || config.key);
    const key = escapeHtml(config.key);
    const helper = escapeHtml(config.helperText || "Portion of the parent category spend.");
    const hoverDetails = String(config.hoverDetails || "").trim();
    const labelTitleAttr = hoverDetails ? ` title="${escapeHtml(hoverDetails)}"` : "";
    return `
      <div class="subcategoryItem">
        <label class="mono spendCat" for="subcategory-${key}"${labelTitleAttr}>${label}</label>
        <input id="subcategory-${key}" class="spend-input" type="number" min="0" step="1" value="" placeholder="0" data-subcategory-key="${key}" data-subcategory-parent="${escapeHtml(parentCategory)}" />
        <p class="subtle subcategoryHint">${helper}</p>
      </div>
    `;
  }).join("");

  return `<div class="subcategoryPanel">${subcategoryItems}</div>`;
}

function moreDetailsControlMarkup(parentCategory, desc, subcategories) {
  const detailsPanel = detailsPanelMarkup(desc);
  const subcategoryPanel = subcategoryPanelMarkup(parentCategory, subcategories);
  if (!detailsPanel && !subcategoryPanel) return { control: "", panel: "" };

  return {
    control: '<details class="spendControl" data-spend-control="more-details"><summary><span class="spendControlLabel">More details</span><span class="spendControlCaret" aria-hidden="true">▾</span></summary></details>',
    panel: `<div class="spendControlPanel spendMoreDetailsPanel">${detailsPanel}${subcategoryPanel}</div>`
  };
}

function bindSpendRowDetailsControls(root) {
  const controls = root.querySelectorAll(".spendControl[data-spend-control]");
  controls.forEach((details) => {
    const kind = details.dataset.spendControl;
    const row = details.closest("[data-spend-row]");
    if (!row || !kind) return;

    details.addEventListener("toggle", () => {
      row.classList.toggle(`is-${kind}-open`, details.open);
    });

    details.open = false;
    row.classList.remove(`is-${kind}-open`);
  });
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
