export function buildShareCopy({ netValue = 0, valuationMode = "estimated", cardCount = 0 } = {}) {
  const roundedNet = Math.max(0, Math.round(Number(netValue) || 0));
  const modeLabel = valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated";
  const headline = cardCount > 1
    ? "I built a smarter card stack"
    : "I found my strongest card";

  return {
    kicker: "CREDITCOMBO · OPTIMIZED",
    headline,
    heroValueLabel: `${modeLabel} annual value unlocked`,
    heroValue: new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0
    }).format(roundedNet),
    support: "Personalized to my real monthly spend.",
    cta: "Check your CreditCombo",
    urlLabel: "creditcombo.ca"
  };
}
