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

  const updateSpendTotal = () => {
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
    inp.addEventListener("input", updateSpendTotal);

    inp.addEventListener("focus", () => {
      if (inp.value === "0") inp.select();
    });

    inp.addEventListener("blur", updateSpendTotal);
  });

  el.querySelectorAll("[data-subcategory-enabled]").forEach((toggle) => {
    const key = toggle.dataset.subcategoryEnabled;
    const input = el.querySelector(`input[data-subcategory-key="${cssEscape(key)}"]`);
    if (!input) return;

    const syncEnabled = () => {
      const enabled = Boolean(toggle.checked);
      input.disabled = !enabled;
      if (!enabled) input.value = "";
      updateSpendTotal();
    };

    toggle.addEventListener("change", syncEnabled);
    syncEnabled();
  });

  updateSpendTotal();
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
    if (!validKeys.has(key) || input.disabled) return;
    const value = Number(input.value);
    spend[key] = Number.isFinite(value) && value > 0 ? value : 0;
  });

  return spend;
}

export function setSubcategoryVisibility(key, visible) {
  if (!key) return;
  document.querySelectorAll(`[data-subcategory-key="${cssEscape(key)}"]`).forEach((input) => {
    const row = input.closest(".subcategoryItem");
    if (!row) return;
    row.classList.toggle("hidden", !visible);
  });
}

export function resetSubcategorySpend(key) {
  if (!key) return;
  document.querySelectorAll(`[data-subcategory-key="${cssEscape(key)}"]`).forEach((input) => {
    input.value = "";
    input.disabled = true;
  });
  document.querySelectorAll(`[data-subcategory-enabled="${cssEscape(key)}"]`).forEach((toggle) => {
    toggle.checked = false;
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

export function renderResult(el, best, annualSpend, schema, valuationMode = "estimated") {
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
  const effectiveEarnRate = totalAnnualSpend > 0 ? best.gross / totalAnnualSpend : null;
  const rows = [
    ["Gross rewards value", formatMoneyCAD(best.gross)],
    ["Annual fees", formatMoneyCAD(best.fees)],
    ["Net value", formatMoneyCAD(best.net)]
  ];

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

  const divider = document.createElement("div");
  divider.className = "divider divider-tight";
  resultContent.append(divider);

  const useHeading = document.createElement("h2");
  useHeading.className = "useHeading";
  useHeading.textContent = "Which card to use";
  resultContent.append(useHeading);

  const instructions = [];
  let useCardDescIndex = 0;
  for (const cat of schema) {
    const total = annualSpend[cat] || 0;
    if (total <= 0) continue;

    const alloc = best.combo
      .map((card) => ({ card, amt: (best.assigned?.[card.id]?.[cat] || 0) }))
      .filter((x) => x.amt > 1e-6)
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

function spendRowMarkup(category, desc, subcategories) {
  const details = detailsControlMarkup(desc);
  const subcats = subcategoryControlMarkup(category, subcategories);

  return `
    <div class="spendRow" data-spend-row data-cat-row="${escapeHtml(category)}">
      <div class="spendRowTop">
        <div class="spendMeta">
          <div class="mono spendCat">${escapeHtml(category)}</div>
          <div class="spendMetaControls">${details.control}${subcats.control}</div>
        </div>
        <div class="spendInputWrap">
          <label class="srOnly" for="spend-${escapeHtml(category)}">Spend for ${escapeHtml(category)}</label>
          <input id="spend-${escapeHtml(category)}" class="spend-input" type="number" min="0" step="1" value="" placeholder="0" data-cat="${escapeHtml(category)}" aria-label="Spend for ${escapeHtml(category)}" />
        </div>
      </div>
      ${details.panel}
      ${subcats.panel}
    </div>
  `;
}

function detailsControlMarkup(desc) {
  const clean = String(desc || "").trim().replace(/\s+/g, " ");
  if (!clean) return { control: "", panel: "" };
  return {
    control: '<details class="spendControl" data-spend-control="details"><summary>Details</summary></details>',
    panel: `<div class="spendControlPanel spendDetailsPanel muted">${escapeHtml(clean)}</div>`
  };
}

function subcategoryControlMarkup(parentCategory, configs) {
  if (!configs.length) return { control: "", panel: "" };

  const subcategoryItems = configs.map((config) => {
    const label = escapeHtml(config.label || config.key);
    const key = escapeHtml(config.key);
    const helper = escapeHtml(config.helperText || "Subset of this category spend.");
    return `
      <div class="subcategoryItem">
        <label class="checkboxLabel" for="subcategory-enabled-${key}">
          <input id="subcategory-enabled-${key}" type="checkbox" data-subcategory-enabled="${key}" />
          ${label}
        </label>
        <label class="srOnly" for="subcategory-${key}">Amount for ${label}</label>
        <input id="subcategory-${key}" class="spend-input" type="number" min="0" step="1" value="" placeholder="0" data-subcategory-key="${key}" data-subcategory-parent="${escapeHtml(parentCategory)}" disabled />
        <p class="subtle subcategoryHint">${helper}</p>
      </div>
    `;
  }).join("");

  return {
    control: '<details class="spendControl" data-spend-control="subcategories"><summary>Subcategories</summary></details>',
    panel: `<div class="spendControlPanel subcategoryPanel">${subcategoryItems}</div>`
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
