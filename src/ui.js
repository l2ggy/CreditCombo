export function money(x) {
  const v = Math.round(Number(x) * 100) / 100;
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
            <span class="mono spendCat">${categoryEmoji(cat)} ${cat}</span>
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


function cardThumbMarkup(card, className = "resultCardThumb", withFrame = true) {
  const image = `<img class="${className}" src="./assets/cards/${escapeHtml(card.id)}.webp" alt="${escapeHtml(card.card_name)}" loading="lazy" decoding="async" onerror="this.remove()" />`;
  if (!withFrame) return image;
  return `<span class="thumbFrame">${image}</span>`;
}

export function renderResult(el, best, annualSpend, schema, valuationMode = "estimated") {
  el.classList.remove("hidden");

  if (!best.combo.length) {
    el.innerHTML = `<span class="badge bad">No result</span> No eligible cards found.`;
    return;
  }

  const comboList = best.combo.map(c => {
    const fee = Number(c.annual_fee?.amount ?? 0);
    return `<li class="resultCardItem">${cardThumbMarkup(c)}
      <div>
        <b>${escapeHtml(c.card_name)}</b> <span class="muted">(${escapeHtml(c.issuer)})</span>
        — <span class="mono">${escapeHtml(c.network)}</span>
        — fee <span class="mono">${money(fee)}/yr</span>
      </div>
    </li>`;
  }).join("");

  const instructions = [];
  for (const cat of schema) {
    const total = annualSpend[cat] || 0;
    if (total <= 0) continue;

    const alloc = best.combo
      .map(c => ({ c, amt: (best.assigned?.[c.id]?.[cat] || 0) }))
      .filter(x => x.amt > 1e-6)
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 3);

    if (!alloc.length) continue;

    const thumbs = alloc.map(({ c, amt }, idx) => {
      const amountPart = alloc.length > 1 ? ` — ${money(amt)}` : "";
      return `<span class="useCardThumb" style="--stack-index:${idx}" title="${escapeHtml(c.card_name)}${escapeHtml(amountPart)}" aria-label="${escapeHtml(c.card_name)}${escapeHtml(amountPart)}">${cardThumbMarkup(c, "useThumbImage", false)}</span>`;
    }).join("");

    const stackClass = alloc.length > 1 ? "useCards useCardsStack" : "useCards useCardsSingle";

    instructions.push(`
      <div class="useTile" role="listitem">
        <div class="mono useCategory">${escapeHtml(cat)}</div>
        <div class="${stackClass}" style="--stack-count:${alloc.length}">${thumbs}</div>
      </div>
    `);
  }

  const useCols = Math.min(4, Math.max(1, instructions.length));

  el.innerHTML = `
    <h2>Best combo</h2>
    <ul class="comboList">${comboList}</ul>

    <h2>Annual value (${valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated"})</h2>
    <table>
      <tbody>
        <tr><th>Gross rewards value</th><td>${money(best.gross)}</td></tr>
        <tr><th>Annual fees</th><td>${money(best.fees)}</td></tr>
        <tr><th>Net value</th><td><b>${money(best.net)}</b></td></tr>
      </tbody>
    </table>

    <div class="divider divider-tight"></div>
    <h2 class="useHeading">Which card to use</h2>
    <div class="useGrid" role="list" aria-label="Card to use by category" style="--use-cols:${useCols}">
      ${instructions.join("") || `<p class="muted">No spend entered.</p>`}
    </div>

    <p class="muted">Mode: ${valuationMode === "minimum_guaranteed" ? "minimum guaranteed points redemption value" : "estimated points value"}.</p>
    <p class="muted">Note: <span class="mono">special_earn_rules</span> are ignored in this MVP.</p>
  `;
}




function categoryEmoji(cat) {
  const c = String(cat || "").toLowerCase();
  if (c.includes("grocery") || c.includes("supermarket")) return "🛒";
  if (c.includes("dining") || c.includes("restaurant") || c.includes("food")) return "🍽️";
  if (c.includes("travel") || c.includes("flight") || c.includes("hotel")) return "✈️";
  if (c.includes("gas") || c.includes("fuel")) return "⛽";
  if (c.includes("transit") || c.includes("transport")) return "🚌";
  if (c.includes("drug") || c.includes("pharmacy") || c.includes("health")) return "💊";
  if (c.includes("stream") || c.includes("entertainment")) return "🎬";
  if (c.includes("mobile") || c.includes("phone") || c.includes("internet") || c.includes("telecom")) return "📱";
  if (c.includes("recurring") || c.includes("subscription") || c.includes("bill") || c.includes("utilities")) return "🧾";
  if (c.includes("amazon") || c.includes("online") || c.includes("e-commerce")) return "📦";
  if (c.includes("home") || c.includes("furniture")) return "🏠";
  return "💳";
}

function spendDescriptionMarkup(desc) {
  const clean = String(desc || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";

  return `<details class="spendDesc"><summary>Details</summary><div class="spendDescBody muted">${escapeHtml(clean)}</div></details>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
