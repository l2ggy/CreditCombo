import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";

export async function loadCoreData() {
  const [cardsJson, programsJson] = await Promise.all([
    loadJson("./data/cards.json"),
    loadJson("./data/programs.json")
  ]);

  const programsMap = normalizePrograms(programsJson);
  return { cardsJson, programsMap };
}

export async function loadOptimizerData() {
  const { cardsJson, programsMap } = await loadCoreData();
  const { schema, categoryDescriptions, eligibleCards, issues } = validateAndFilterCards(cardsJson, programsMap);

  return { schema, categoryDescriptions, eligibleCards, issues, programsMap };
}
