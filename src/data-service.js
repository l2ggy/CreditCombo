import { loadJson, normalizePrograms, validateAndFilterCards } from "./data.js";

function normalizeSubcategoryConfigs(subcategoriesJson) {
  const configs = subcategoriesJson?.subcategory_configs;
  return configs && typeof configs === "object" ? configs : {};
}

export async function loadCoreData() {
  const [cardsJson, programsJson, subcategoriesJson] = await Promise.all([
    loadJson("./data/cards.json"),
    loadJson("./data/programs.json"),
    loadJson("./data/subcategories.json")
  ]);

  const programsMap = normalizePrograms(programsJson);
  const subcategoryConfigs = normalizeSubcategoryConfigs(subcategoriesJson);
  return { cardsJson, programsMap, subcategoryConfigs };
}

export async function loadOptimizerData() {
  const { cardsJson, programsMap, subcategoryConfigs } = await loadCoreData();
  const { schema, categoryDescriptions, eligibleCards, issues } = validateAndFilterCards(cardsJson, programsMap);

  return { schema, categoryDescriptions, eligibleCards, issues, programsMap, subcategoryConfigs };
}
