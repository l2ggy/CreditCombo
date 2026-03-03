export function buildShareCopy({ netValue = 0, valuationMode = "estimated", cardCount = 0 } = {}) {
  const roundedNet = Math.max(0, Math.round(Number(netValue) || 0));
  const modeLabel = valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated";

  return {
    kicker: "CREDITCOMBO RESULT",
    headline: cardCount > 1 ? "My optimized credit card lineup" : "My optimized credit card pick",
    heroValueLabel: `Annual ${modeLabel} value`,
    heroValue: new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0
    }).format(roundedNet),
    support: "Built from my real spending profile.",
    cta: "Check your CreditCombo",
    urlLabel: "creditcombo.ca"
  };
}
