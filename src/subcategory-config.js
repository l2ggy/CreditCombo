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

  const mappedCategory = subcategoryMappedCategory(config, cardNetwork, parentCategory);
  const directRate = Number(config?.cardRateOverrides?.[card?.id]);
  if (Number.isFinite(directRate) && directRate >= 0) return directRate;

  const baseRate = Number(readCardRate(card, mappedCategory));
  if (!Number.isFinite(baseRate) || baseRate < 0) return 0;

  const cardMultiplier = Number(config?.cardMultipliers?.[card?.id]);
  if (Number.isFinite(cardMultiplier) && cardMultiplier >= 0) return baseRate * cardMultiplier;

  return baseRate * subcategoryRateMultiplier(config, cardNetwork);
}

export const subcategoryConfigs = {
  grocery: [
    {
      key: "grocery_costco",
      label: "Costco",
      helperText: "Warehouse groceries.",
      logicAdjustment: "network_category_override",
      acceptedNetworks: ["mastercard"],
      networkCategoryMap: {
        mastercard: "grocery"
      }
    },
    {
      key: "grocery_george_weston",
      label: "Weston brands",
      helperText: "Loblaws, No Frills, Real Canadian Superstore, T&T, Fortinos, and more.",
      logicAdjustment: "network_category_override",
      acceptedNetworks: ["mastercard", "visa"],
      networkCategoryMap: {
        mastercard: "grocery",
        visa: "grocery"
      },
      cardRateOverrides: {
        pc_financial_world_elite: 30,
        pc_financial_world_mastercard: 20,
        pc_insiders_world_elite_mastercard: 40,
        pc_financial_mastercard: 10
      },
      browserTag: "merchant"
    },
    {
      key: "grocery_walmart",
      label: "Walmart",
      helperText: "Walmart groceries.",
      logicAdjustment: "network_category_override",
      acceptedNetworks: ["mastercard", "visa", "amex"],
      networkCategoryMap: {
        mastercard: "grocery",
        visa: "other",
        amex: "other"
      }
    }
  ],
  gas: [
    {
      key: "gas_costco",
      label: "Costco gas",
      helperText: "Costco fuel stations.",
      logicAdjustment: "network_category_override",
      acceptedNetworks: ["mastercard"],
      networkCategoryMap: {
        mastercard: "gas"
      }
    },
    {
      key: "gas_esso_mobil",
      label: "Esso & Mobil",
      helperText: "Esso and Mobil fuel stations.",
      cardRateOverrides: {
        pc_financial_world_elite: 30,
        pc_financial_world_mastercard: 20,
        pc_insiders_world_elite_mastercard: 40,
        pc_financial_mastercard: 10
      },
      browserTag: "merchant"
    }
  ],
  drugstore: [
    {
      key: "drugstore_shoppers_drug_mart",
      label: "Shoppers Drug Mart",
      helperText: "Shoppers Drug Mart merchant-specific rates.",
      cardRateOverrides: {
        pc_financial_world_elite: 45,
        pc_financial_world_mastercard: 35,
        pc_insiders_world_elite_mastercard: 50,
        pc_financial_mastercard: 25
      },
      browserTag: "merchant"
    }
  ],
  travel: [
    {
      key: "travel_air_canada_direct",
      label: "Air Canada direct",
      helperText: "Direct Air Canada and Air Canada Vacations purchases.",
      cardRateOverrides: {
        amex_aeroplan_business_reserve: 3,
        amex_aeroplan_card: 2,
        amex_aeroplan_reserve: 3,
        cibc_aeroplan_visa: 1.5,
        cibc_aeroplan_vi: 2,
        cibc_aeroplan_vip: 2,
        td_aeroplan_visa_platinum: 2,
        td_aeroplan_vi: 2,
        td_aeroplan_vip: 2,
        td_aeroplan_visa_business_card: 2
      },
      browserTag: "merchant"
    },
    {
      key: "travel_expedia_for_td",
      label: "Expedia for TD",
      helperText: "Travel bookings through Expedia for TD.",
      cardRateOverrides: {
        td_business_travel_visa_card: 9,
        td_first_class_travel_vi: 8
      },
      browserTag: "portal"
    },
    {
      key: "travel_cibc_rewards_centre",
      label: "CIBC Rewards Centre",
      helperText: "CIBC Rewards Centre portal bookings.",
      cardRateOverrides: {
        cibc_aventura_vi: 2
      },
      browserTag: "portal"
    },
    {
      key: "travel_bmo_rewards_portal",
      label: "BMO Rewards Travel",
      helperText: "Eligible travel bookings through the BMO Rewards travel portal.",
      cardRateOverrides: {
        bmo_ascend_world_elite_business_mastercard: 4
      },
      browserTag: "portal"
    },
    {
      key: "travel_porter",
      label: "Porter direct",
      helperText: "Eligible Porter purchases.",
      cardRateOverrides: {
        bmo_viporter_mastercard: 2,
        bmo_viporter_world_elite_mastercard: 3
      },
      browserTag: "merchant"
    },
    {
      key: "travel_westjet_partner",
      label: "WestJet / Vacations / Sunwing",
      helperText: "Eligible WestJet flights, WestJet Vacations, and Sunwing Vacations purchases.",
      cardRateOverrides: {
        westjet_rbc_mastercard: 1.5,
        westjet_rbc_world_elite: 2
      },
      browserTag: "merchant"
    },
    {
      key: "travel_pc_travel",
      label: "PC Travel",
      helperText: "PC Travel merchant-partner bookings.",
      cardRateOverrides: {
        pc_financial_world_elite: 30,
        pc_financial_world_mastercard: 20,
        pc_insiders_world_elite_mastercard: 40,
        pc_financial_mastercard: 10
      },
      browserTag: "portal"
    },
    {
      key: "travel_cathay_pacific",
      label: "Cathay Pacific online",
      helperText: "Cathay Pacific ticket purchases at cathaypacific.com/ca.",
      cardRateOverrides: {
        neo_cathay_world_elite_mastercard: 4
      },
      browserTag: "merchant"
    },
    {
      key: "travel_marriott_bonvoy_properties",
      label: "Marriott Bonvoy properties",
      helperText: "Participating Marriott Bonvoy hotel property spend.",
      cardRateOverrides: {
        amex_marriott_bonvoy: 5,
        amex_bonvoy_business: 5
      },
      browserTag: "merchant"
    }
  ],
  other: [
    {
      key: "other_canadian_tire_family",
      label: "Canadian Tire Brands",
      helperText: "Canadian Tire brands (e.g., Canadian Tire, Sport Chek, Mark's, PartSource).",
      cardRateOverrides: {
        canadian_tire_triangle_we: 4
      },
      browserTag: "merchant"
    },
    {
      key: "other_amazon_ca_whole_foods",
      label: "Amazon.ca & Whole Foods",
      helperText: "Eligible Amazon.ca and Whole Foods purchases (Prime may earn higher rates).",
      cardRateOverrides: {
        amazon_ca_rewards_mastercard: 1.5
      },
      browserTag: "merchant"
    }
  ],
  bills: [
    {
      key: "chexy_bills",
      label: "Chexy bills",
      helperText: "Portion of bills spend.",
      feeAdjustment: "chexy"
    }
  ]
};

export function merchantPortalConfigs(configs = subcategoryConfigs) {
  return Object.entries(configs).flatMap(([parentCategory, entries]) =>
    (entries || [])
      .filter((entry) => entry.browserTag === "merchant" || entry.browserTag === "portal")
      .map((entry) => ({ parentCategory, ...entry }))
  );
}
