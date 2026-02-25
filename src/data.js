export async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`);
  return res.json();
}

export function normalizePrograms(programsJson) {
  const list = programsJson.programs || (Array.isArray(programsJson) ? programsJson : []);
  const map = new Map();
  for (const p of list) {
    map.set(p.program_id, {
      program_id: p.program_id,
      program_name: p.program_name ?? p.program_id,
      program_type: p.program_type ?? "points",
      cents_per_point: p.cents_per_point ?? null
    });
  }
  return map;
}

/**
 * Exclusion rules:
 * - If program_id missing => exclude card
 * - If program_type === "points" and cents_per_point is null => exclude card
 * - If cashback, we accept even with cents_per_point missing (we assume face value; earn_rates are %).
 */
export function validateAndFilterCards(cardsJson, programsMap) {
  const schema = cardsJson?.meta?.category_schema_modeled ?? [];
  const rawCards = cardsJson?.cards ?? [];

  if (!Array.isArray(schema) || schema.length === 0) {
    throw new Error("cards.json missing meta.category_schema_modeled");
  }
  if (!Array.isArray(rawCards) || rawCards.length === 0) {
    throw new Error("cards.json missing cards[]");
  }

  const eligible = [];
  const issues = [];

  for (const c of rawCards) {
    const programId = c.rewards_program;
    if (!programId) {
      issues.push({ card: c.card_name ?? c.id, reason: "Missing rewards_program (program_id)" });
      continue;
    }
    const p = programsMap.get(programId);
    if (!p) {
      issues.push({ card: c.card_name ?? c.id, reason: `Program not found: ${programId}` });
      continue;
    }
    if ((p.program_type ?? "points") === "points" && (p.cents_per_point == null)) {
      issues.push({ card: c.card_name ?? c.id, reason: `Missing cents_per_point for points program: ${programId}` });
      continue;
    }

    eligible.push(c);
  }

  return { schema, eligibleCards: eligible, issues };
}