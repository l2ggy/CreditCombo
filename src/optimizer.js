export function annualizeMonthlySpend(monthlySpend, schema) {
  const annual = {};
  for (const cat of schema) annual[cat] = (Number(monthlySpend[cat] ?? 0) || 0) * 12;
  return annual;
}

function cardRate(card, cat) {
  const er = card.earn_rates || {};
  if (er[cat] != null) return Number(er[cat]);
  if (er.other != null) return Number(er.other);
  return 0;
}

function pointsCpp(program, valuationMode, customProgramCpp = {}) {
  const custom = Number(customProgramCpp?.[program?.program_id]);
  if (Number.isFinite(custom)) return custom;

  const estimated = Number(program?.cents_per_point ?? 0);
  if (valuationMode !== "minimum_guaranteed") return estimated;

  const minimum = program?.minimum_cents_per_point;
  if (minimum == null) return estimated;
  return Number(minimum);
}

function programInfo(card, programsMap, valuationMode, customProgramCpp = {}) {
  const program = programsMap.get(card.rewards_program);
  const type = program?.program_type ?? "points";
  const cpp = type === "cashback" ? 1.0 : pointsCpp(program, valuationMode, customProgramCpp);
  return { type, cpp };
}

function valuePerDollar(card, cat, programsMap, valuationMode, customProgramCpp = {}) {
  const r = cardRate(card, cat);
  const { type, cpp } = programInfo(card, programsMap, valuationMode, customProgramCpp);
  if (type === "cashback") return r / 100.0;
  return r * (cpp / 100.0);
}

function capAnnual(cap) {
  const period = String(cap.cap_period ?? "annual").toLowerCase();
  const amt = Number(cap.cap_amount ?? Infinity);
  return period === "monthly" ? amt * 12 : amt;
}

function nextBestCard(combo, current, cat, programsMap, valuationMode, customProgramCpp = {}) {
  const ranked = [...combo].sort((a, b) => valuePerDollar(b, cat, programsMap, valuationMode, customProgramCpp) - valuePerDollar(a, cat, programsMap, valuationMode, customProgramCpp));
  if (ranked.length <= 1) return null;
  if (ranked[0].id !== current.id) return ranked[0];
  return ranked[1];
}

function initialAssignment(combo, annualSpend, schema, programsMap, valuationMode, customProgramCpp = {}) {
  const assigned = Object.fromEntries(combo.map(c => [c.id, Object.fromEntries(schema.map(cat => [cat, 0]))]));

  for (const cat of schema) {
    const amt = annualSpend[cat] || 0;
    if (amt <= 0) continue;

    let best = combo[0];
    for (const c of combo) {
      if (valuePerDollar(c, cat, programsMap, valuationMode, customProgramCpp) > valuePerDollar(best, cat, programsMap, valuationMode, customProgramCpp)) best = c;
    }
    assigned[best.id][cat] += amt;
  }
  return assigned;
}

function enforceCapsByRerouting(combo, assigned, schema, programsMap, valuationMode, customProgramCpp = {}, passes = 8) {
  for (let iter = 0; iter < passes; iter++) {
    let changed = false;

    for (const card of combo) {
      const caps = card.caps || [];
      for (const cap of caps) {
        const cats = (cap.categories || []).filter(c => schema.includes(c));
        if (!cats.length) continue;

        const capAmt = capAnnual(cap);
        let total = 0;
        for (const cat of cats) total += assigned[card.id][cat] || 0;
        if (total <= capAmt + 1e-9) continue;

        let overflow = total - capAmt;

        const moves = [];
        for (const cat of cats) {
          const amtInCat = assigned[card.id][cat] || 0;
          if (amtInCat <= 0) continue;

          const nb = nextBestCard(combo, card, cat, programsMap, valuationMode, customProgramCpp);
          if (!nb) continue;

          const loss = valuePerDollar(card, cat, programsMap, valuationMode, customProgramCpp) - valuePerDollar(nb, cat, programsMap, valuationMode, customProgramCpp);
          moves.push({ loss, cat, amtInCat, nb });
        }

        moves.sort((a, b) => a.loss - b.loss);

        for (const m of moves) {
          if (overflow <= 1e-9) break;
          const mv = Math.min(m.amtInCat, overflow);
          assigned[card.id][m.cat] -= mv;
          assigned[m.nb.id][m.cat] += mv;
          overflow -= mv;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }
}

function valueWithWithinCardCaps(card, assignedForCard, schema, programsMap, valuationMode, customProgramCpp = {}) {
  let base = 0;
  for (const cat of schema) {
    const amt = assignedForCard[cat] || 0;
    if (amt > 0) base += amt * valuePerDollar(card, cat, programsMap, valuationMode, customProgramCpp);
  }

  const caps = card.caps || [];
  if (!caps.length) return base;

  let adj = 0;
  const { type, cpp } = programInfo(card, programsMap, valuationMode, customProgramCpp);

  for (const cap of caps) {
    const cats = (cap.categories || []).filter(c => schema.includes(c));
    if (!cats.length) continue;

    const capAmt = capAnnual(cap);
    let total = 0;
    for (const cat of cats) total += assignedForCard[cat] || 0;
    if (total <= capAmt + 1e-9) continue;

    let overflow = total - capAmt;
    const aboveRate = Number(cap.earn_rate_above_cap ?? 0);
    const aboveVPD = (type === "cashback") ? (aboveRate / 100.0) : (aboveRate * (cpp / 100.0));

    const parts = [];
    for (const cat of cats) {
      const amt = assignedForCard[cat] || 0;
      if (amt <= 0) continue;
      parts.push({ cat, amt, normalVPD: valuePerDollar(card, cat, programsMap, valuationMode, customProgramCpp) });
    }
    parts.sort((a, b) => a.normalVPD - b.normalVPD);

    for (const p of parts) {
      if (overflow <= 1e-9) break;
      const d = Math.min(p.amt, overflow);
      adj += d * (aboveVPD - p.normalVPD);
      overflow -= d;
    }
  }

  return base + adj;
}

function* combinations(arr, k) {
  const n = arr.length;
  if (k <= 0 || k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map(i => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function evaluateCombo(combo, annualSpend, schema, programsMap, valuationMode, customProgramCpp = {}) {
  const assigned = initialAssignment(combo, annualSpend, schema, programsMap, valuationMode, customProgramCpp);
  enforceCapsByRerouting(combo, assigned, schema, programsMap, valuationMode, customProgramCpp);

  let gross = 0;
  for (const c of combo) gross += valueWithWithinCardCaps(c, assigned[c.id], schema, programsMap, valuationMode, customProgramCpp);

  const fees = combo.reduce((s, c) => s + Number((c.annual_fee?.amount ?? 0)), 0);
  const net = gross - fees;

  return { combo, net, gross, fees, assigned };
}

function cardPotential(card, activeCats, annualSpend, programsMap, valuationMode, customProgramCpp = {}) {
  let gross = 0;
  for (const cat of activeCats) {
    const weight = Number(annualSpend?.[cat] ?? 0) || 1;
    gross += weight * valuePerDollar(card, cat, programsMap, valuationMode, customProgramCpp);
  }
  const fee = Number(card.annual_fee?.amount ?? 0);
  return gross - fee;
}

function selectCandidateCards(cards, programsMap, schema, annualSpend, maxSize, candidateLimit, valuationMode, customProgramCpp = {}) {
  const maxCandidates = Math.max(maxSize, candidateLimit);
  if (cards.length <= maxCandidates) return cards;

  const activeCats = schema.filter(cat => (annualSpend?.[cat] || 0) > 0);
  const catsToUse = activeCats.length ? activeCats : schema;
  const perCategoryTake = Math.max(4, Math.min(8, maxSize + 2));

  const byId = new Map(cards.map(card => [card.id, card]));
  const selectedIds = new Set();

  for (const cat of catsToUse) {
    const ranked = [...cards].sort((a, b) => valuePerDollar(b, cat, programsMap, valuationMode, customProgramCpp) - valuePerDollar(a, cat, programsMap, valuationMode, customProgramCpp));
    for (const card of ranked.slice(0, perCategoryTake)) selectedIds.add(card.id);
  }

  const rankedByPotential = [...cards]
    .sort((a, b) => cardPotential(b, catsToUse, annualSpend, programsMap, valuationMode, customProgramCpp) - cardPotential(a, catsToUse, annualSpend, programsMap, valuationMode, customProgramCpp));
  for (const card of rankedByPotential.slice(0, maxCandidates)) selectedIds.add(card.id);

  const lowFeeCards = [...cards]
    .sort((a, b) => Number(a.annual_fee?.amount ?? 0) - Number(b.annual_fee?.amount ?? 0));
  for (const card of lowFeeCards.slice(0, maxSize + 2)) selectedIds.add(card.id);

  const selectedCards = [...selectedIds]
    .map(id => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => cardPotential(b, catsToUse, annualSpend, programsMap, valuationMode, customProgramCpp) - cardPotential(a, catsToUse, annualSpend, programsMap, valuationMode, customProgramCpp));

  return selectedCards.slice(0, maxCandidates);
}

function nChooseK(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i++) result = (result * (n - kk + i)) / i;
  return result;
}

function totalCombinationCount(n, maxSize) {
  let total = 0;
  for (let size = 1; size <= maxSize; size++) total += nChooseK(n, size);
  return total;
}

function computeCandidateLimit(cardCount, maxSize) {
  const TARGET_COMBOS = 80000;
  let limit = Math.min(cardCount, 36);

  while (limit > maxSize && totalCombinationCount(limit, maxSize) > TARGET_COMBOS) limit--;

  return Math.max(maxSize, limit);
}

export function findBestCombo({ cards, programsMap, schema, k, annualSpend, valuationMode = "estimated", excludedProgramIds = [], customProgramCpp = {}, lockedCardIds = [], additionalCardIds = null }) {
  let best = { combo: [], net: -1e18, gross: 0, fees: 0, assigned: null };

  const excludedPrograms = new Set(excludedProgramIds || []);
  const filteredCards = cards.filter((card) => !excludedPrograms.has(card.rewards_program));
  const byId = new Map(filteredCards.map((card) => [card.id, card]));
  const lockedCards = [...new Set(lockedCardIds)].map((id) => byId.get(id)).filter(Boolean);
  const lockedIds = new Set(lockedCards.map((card) => card.id));

  const additionalAllowedIds = additionalCardIds ? new Set(additionalCardIds) : null;
  const unlockedCards = filteredCards.filter((card) => !lockedIds.has(card.id) && (!additionalAllowedIds || additionalAllowedIds.has(card.id)));
  const maxAdditionalCount = Math.max(0, Math.min(Number(k) || 0, unlockedCards.length));

  if (!lockedCards.length && maxAdditionalCount < 1) return best;

  if (lockedCards.length) {
    best = evaluateCombo(lockedCards, annualSpend, schema, programsMap, valuationMode, customProgramCpp);
  }

  for (let additionalCount = 1; additionalCount <= maxAdditionalCount; additionalCount++) {
    const candidateLimit = computeCandidateLimit(unlockedCards.length, additionalCount);
    const candidateUnlockedCards = selectCandidateCards(unlockedCards, programsMap, schema, annualSpend, additionalCount, candidateLimit, valuationMode, customProgramCpp);

    for (const combo of combinations(candidateUnlockedCards, additionalCount)) {
      const result = evaluateCombo([...lockedCards, ...combo], annualSpend, schema, programsMap, valuationMode, customProgramCpp);
      const sameNet = Math.abs(result.net - best.net) <= 1e-9;
      const fewerCards = result.combo.length < best.combo.length;
      if (result.net > best.net || (sameNet && fewerCards)) best = result;
    }
  }

  return best;
}
