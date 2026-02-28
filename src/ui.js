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
      ${schema.map(cat => `
        <label class="spendRow" for="spend-${cat}">
          <span class="spendMeta">
            <span class="mono spendCat">${cat}</span>
            ${spendDescriptionMarkup(categoryDescriptions[cat] || "")}
          </span>
          <input id="spend-${cat}" class="spend-input" type="number" min="0" step="1" value="0" data-cat="${cat}" aria-label="Monthly spend for ${cat}" />
        </label>
      `).join("")}
    </div>
  `;

  el.querySelectorAll('input[data-cat]').forEach((inp) => {
    inp.addEventListener("focus", () => {
      if (inp.value === "0") inp.select();
    });

    inp.addEventListener("blur", () => {
      if (inp.value.trim() === "") inp.value = "0";
    });
  });
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


export function renderResult(el, best, annualSpend, schema, valuationMode = "estimated") {
  el.classList.remove("hidden");
  el.innerHTML = "";

  if (!best.combo.length) {
    const badge = document.createElement("span");
    badge.className = "badge bad";
    badge.textContent = "No result";
    el.append(badge, " No eligible cards found.");
    return;
  }

  const comboHeading = document.createElement("h2");
  comboHeading.textContent = "Best combo";
  el.append(comboHeading);

  const comboList = document.createElement("ul");
  comboList.className = "comboList";
  best.combo.forEach((card) => comboList.append(renderResultCardItem(card)));
  el.append(comboList);

  const valueHeading = document.createElement("h2");
  valueHeading.textContent = `Annual value (${valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated"})`;
  el.append(valueHeading);

  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
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
  el.append(table);

  const divider = document.createElement("div");
  divider.className = "divider divider-tight";
  el.append(divider);

  const useHeading = document.createElement("h2");
  useHeading.className = "useHeading";
  useHeading.textContent = "Which card to use";
  el.append(useHeading);

  const instructions = [];
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
    tile.className = "useTile";
    tile.setAttribute("role", "listitem");

    const category = document.createElement("div");
    category.className = "mono useCategory";
    category.textContent = cat;
    tile.append(category);

    const stack = document.createElement("div");
    stack.className = alloc.length > 1 ? "useCards useCardsStack" : "useCards useCardsSingle";
    stack.style.setProperty("--stack-count", String(alloc.length));

    alloc.forEach(({ card, amt }, idx) => {
      const amountPart = alloc.length > 1 ? ` — ${formatMoneyCAD(amt)}` : "";
      const label = `${card.card_name}${amountPart}`;

      const thumb = document.createElement("span");
      thumb.className = "useCardThumb";
      thumb.style.setProperty("--stack-index", String(idx));
      thumb.title = label;
      thumb.dataset.card = label;
      thumb.setAttribute("aria-label", label);
      thumb.append(renderCardThumb(card, { className: "useThumbImage", withFrame: false }));
      stack.append(thumb);
    });

    tile.append(stack);
    instructions.push(tile);
  }

  const useCols = Math.min(4, Math.max(1, instructions.length));
  const useGrid = document.createElement("div");
  useGrid.className = "useGrid";
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

  el.append(useGrid);
}


function spendDescriptionMarkup(desc) {
  const clean = String(desc || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";

  return `<details class="spendDesc"><summary><span class="spendDescLabel">Details</span><span class="spendDescCaret" aria-hidden="true">▾</span></summary><div class="spendDescBody muted">${escapeHtml(clean)}</div></details>`;
}
