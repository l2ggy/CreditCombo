export function buildShareCopy({ netValue = 0, valuationMode = "estimated", cardCount = 0 } = {}) {
  const roundedNet = Math.max(0, Math.round(Number(netValue) || 0));
  const modeLabel = valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated";

  return {
    kicker: "CREDITCOMBO · OPTIMIZED",
    headline: cardCount > 1 ? "I unlocked a stronger card lineup" : "I unlocked a stronger card strategy",
    heroValueLabel: `Projected annual upside (${modeLabel})`,
    heroValue: new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0
    }).format(roundedNet),
    support: "Personalized from my real spending mix across categories.",
    cta: "Check your CreditCombo",
    nativeShareText: `I just optimized my wallet with CreditCombo and unlocked ${roundedNet.toLocaleString("en-CA")} CAD in annual value.`,
    urlLabel: "creditcombo.ca"
  };
}
