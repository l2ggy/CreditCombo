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
    <table>
      <thead><tr><th>Category</th><th>Monthly spend</th></tr></thead>
      <tbody>
        ${schema.map(cat => `
          <tr>
            <td>
              <div class="mono">${cat}</div>
              <div class="category-desc muted">${escapeHtml(categoryDescriptions[cat] || "")}</div>
            </td>
            <td><input class="spend-input" type="number" min="0" step="1" value="0" data-cat="${cat}" /></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
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
  document.querySelectorAll("input[data-cat]").forEach(inp => {
    const cat = inp.dataset.cat;
    if (!schema.includes(cat)) return;
    const v = Number(inp.value);
    spend[cat] = Number.isFinite(v) && v >= 0 ? v : 0;
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


function cardThumbMarkup(card, className = "resultCardThumb") {
  return `<img class="${className}" src="./assets/cards/${escapeHtml(card.id)}.webp" alt="${escapeHtml(card.card_name)}" loading="lazy" decoding="async" onerror="this.remove()" />`;
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
      .sort((a, b) => b.amt - a.amt);

    if (alloc.length === 1) {
      instructions.push(`<tr><td class="mono">${escapeHtml(cat)}</td><td>${escapeHtml(alloc[0].c.card_name)}</td></tr>`);
    } else {
      const parts = alloc.slice(0, 3).map(x => `${escapeHtml(x.c.card_name)} (${money(x.amt)})`).join(", ");
      instructions.push(`<tr><td class="mono">${escapeHtml(cat)}</td><td>split → ${parts}</td></tr>`);
    }
  }

  el.innerHTML = `
    <h2>Best combo</h2>
    <ul>${comboList}</ul>

    <h2>Annual value (${valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated"})</h2>
    <table>
      <tbody>
        <tr><th>Gross rewards value</th><td>${money(best.gross)}</td></tr>
        <tr><th>Annual fees</th><td>${money(best.fees)}</td></tr>
        <tr><th>Net value</th><td><b>${money(best.net)}</b></td></tr>
      </tbody>
    </table>

    <h2>Which card to use</h2>
    <table>
      <thead><tr><th>Category</th><th>Use</th></tr></thead>
      <tbody>
        ${instructions.join("") || `<tr><td colspan="2" class="muted">No spend entered.</td></tr>`}
      </tbody>
    </table>

    <p class="muted">Mode: ${valuationMode === "minimum_guaranteed" ? "minimum guaranteed points redemption value" : "estimated points value"}. Note: <span class="mono">special_earn_rules</span> are ignored in this MVP.</p>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
