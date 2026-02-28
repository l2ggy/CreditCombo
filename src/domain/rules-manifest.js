export const RULES_MANIFEST = {
  modeled_behaviors: {
    valuation_mode:
      "Two valuation modes are modeled: estimated points value and minimum guaranteed redemption value.",
    caps_routing:
      "Category spend is assigned to the best card, cap overflow is rerouted to the next-best card, and residual overflow can earn at the above-cap rate.",
    fee_subtraction:
      "Annual fees are subtracted from gross rewards to report net annual value."
  },
  out_of_scope_behaviors: {
    special_earn_rules:
      "Merchant- or portal-specific special_earn_rules are intentionally ignored.",
    mcc_quirks:
      "MCC quirks and acceptance constraints are not modeled.",
    promos:
      "One-time promotions and welcome bonuses are not modeled."
  }
};
