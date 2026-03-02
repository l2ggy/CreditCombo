export function normalizeCardNetwork(network) {
  if (!network) return "";
  const normalized = String(network).trim().toLowerCase();
  if (normalized === "mastercard") return "mastercard";
  if (normalized === "visa") return "visa";
  if (normalized === "american express" || normalized === "amex") return "amex";
  return normalized;
}

export function subcategoryMappedCategory(config, cardNetwork, parentCategory) {
  if (config?.logicAdjustment !== "network_category_override") return parentCategory;
  const networkCategoryMap = config.networkCategoryMap || {};
  return networkCategoryMap[cardNetwork] || parentCategory;
}

export function subcategoryRateMultiplier(config, cardNetwork) {
  const base = Number(config?.merchantMultiplier ?? 1);
  const safeBase = Number.isFinite(base) && base >= 0 ? base : 1;
  const networkMultiplier = Number(config?.networkMerchantMultiplier?.[cardNetwork] ?? 1);
  const safeNetwork = Number.isFinite(networkMultiplier) && networkMultiplier >= 0 ? networkMultiplier : 1;
  return safeBase * safeNetwork;
}

export function subcategoryRateForCard(config, card, parentCategory, readCardRate) {
  const cardNetwork = normalizeCardNetwork(card?.network);
  const acceptedNetworks = new Set((config?.acceptedNetworks || []).map(normalizeCardNetwork));
  if (acceptedNetworks.size && !acceptedNetworks.has(cardNetwork)) return 0;

  const eligibleCardIds = new Set(config?.eligibleCardIds || []);
  if (eligibleCardIds.size && !eligibleCardIds.has(card?.id)) return 0;

  const mappedCategory = subcategoryMappedCategory(config, cardNetwork, parentCategory);
  const directRate = Number(card?.subcategory_earn_rates?.[config?.key]);
  if (Number.isFinite(directRate) && directRate >= 0) return directRate;

  const baseRate = Number(readCardRate(card, mappedCategory));
  if (!Number.isFinite(baseRate) || baseRate < 0) return 0;

  const cardMultiplier = Number(config?.cardMultipliers?.[card?.id]);
  if (Number.isFinite(cardMultiplier) && cardMultiplier >= 0) return baseRate * cardMultiplier;

  return baseRate * subcategoryRateMultiplier(config, cardNetwork);
}

export function merchantPortalConfigs(configs = {}) {
  return Object.entries(configs).flatMap(([parentCategory, entries]) =>
    (entries || [])
      .filter((entry) => entry.browserTag === "merchant" || entry.browserTag === "portal")
      .map((entry) => ({ parentCategory, ...entry }))
  );
}
