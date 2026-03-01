import { formatMoneyCAD } from "./shared/format.js";
import { escapeHtml } from "./shared/sanitize.js";
import { renderCardThumb, renderResultCardItem } from "./shared/render.js";

export function clampInt(n, lo, hi) {
  n = Math.floor(Number(n) || lo);
  return Math.max(lo, Math.min(hi, n));
}

export function renderSpendTable(el, schema, categoryDescriptions = {}) {
  el.innerHTML = `
    <div class="spendGrid" role="group" aria-label="Monthly spend by category">
      ${schema.map(cat => {
    const row = `
          <label class="spendRow" for="spend-${cat}">
            <span class="spendMeta">
              <span class="mono spendCat">${cat}</span>
              ${spendDescriptionMarkup(categoryDescriptions[cat] || "")}
            </span>
            <input id="spend-${cat}" class="spend-input" type="number" min="0" step="1" value="" placeholder="0" data-cat="${cat}" aria-label="Monthly spend for ${cat}" />
          </label>
        `;

    if (cat !== "bills") return row;

    return `${row}
        <label class="spendRow spendRow-sub" for="chexySpend">
          <span class="spendMeta">
            <span class="mono spendCat">↳ chexy (monthly, included in bills)</span>
            <span class="muted chexyHint">Charged with fee. Defaults to 1.75% fee, adjustable in Advanced preferences.</span>
          </span>
          <div class="chexySliderWrap">
            <input id="chexySpend" class="chexy-spend-slider" type="range" min="0" max="0" step="1" value="0" aria-label="Monthly bills spend paid via Chexy" />
            <output id="chexySpendValue" class="muted" for="chexySpend">$0</output>
          </div>
        </label>`;
  }).join("")}
    </div>
  `;

  const spendTotalEl = document.getElementById("spendTotal");

  const updateSpendTotal = () => {
    const billsInput = el.querySelector('input[data-cat="bills"]');
    const chexyInput = document.getElementById("chexySpend");
    const chexyValueEl = document.getElementById("chexySpendValue");

    const total = [...el.querySelectorAll("input[data-cat]")].reduce((sum, input) => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) return sum;
      return sum + value;
    }, 0);

    if (chexyInput) {
      const billsValue = Math.max(0, Number(billsInput?.value ?? 0) || 0);
      chexyInput.max = String(Math.floor(billsValue));
      if (Number(chexyInput.value) > billsValue) chexyInput.value = String(Math.floor(billsValue));
      chexyInput.disabled = billsValue <= 0;

      if (chexyValueEl) {
        chexyValueEl.textContent = formatMoneyCAD(Number(chexyInput.value) || 0, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
      }
    }

    if (spendTotalEl) {
      spendTotalEl.textContent = `Total monthly spend: ${formatMoneyCAD(total, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
  };

  el.querySelectorAll('input[data-cat]').forEach((inp) => {
    inp.addEventListener("input", updateSpendTotal);

    inp.addEventListener("focus", () => {
      if (inp.value === "0") inp.select();
    });

    inp.addEventListener("blur", updateSpendTotal);
  });

  const chexyInput = document.getElementById("chexySpend");
  if (chexyInput) {
    chexyInput.addEventListener("input", updateSpendTotal);
    chexyInput.addEventListener("change", updateSpendTotal);
  }

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


export function renderResult(el, best, annualSpend, schema, valuationMode = "estimated", chexySummary = null) {
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
  const netValue = best.net - (chexySummary?.enabled ? chexySummary.chexyAnnualFee : 0);
  const rows = [
    ["Gross rewards value", formatMoneyCAD(best.gross)],
    ["Annual fees", formatMoneyCAD(best.fees)],
    ...(chexySummary?.enabled ? [["Chexy fees", formatMoneyCAD(chexySummary.chexyAnnualFee)]] : []),
    ["Net value", formatMoneyCAD(netValue)]
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

  if (chexySummary?.enabled) {
    const chexyCallout = document.createElement("p");
    chexyCallout.className = "earnRateCallout";
    const isWorthIt = Boolean(chexySummary.isWorthIt);
    const deltaText = formatMoneyCAD(Math.abs(chexySummary.incrementalNetValue || 0));
    chexyCallout.textContent = isWorthIt
      ? `Chexy looks worth it: +${deltaText}/year after fees.`
      : `Chexy does not look worth it: -${deltaText}/year after fees.`;
    resultContent.append(chexyCallout);
  }

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


function spendDescriptionMarkup(desc) {
  const clean = String(desc || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";

  return `<details class="spendDesc"><summary><span class="spendDescLabel">Details</span><span class="spendDescCaret" aria-hidden="true">▾</span></summary><div class="spendDescBody muted">${escapeHtml(clean)}</div></details>`;
}
