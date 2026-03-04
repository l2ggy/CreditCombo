export function buildShareCopy({ netValue = 0, valuationMode = "estimated", cardCount = 0, siteHost = "" } = {}) {
  const roundedNet = Math.max(0, Math.round(Number(netValue) || 0));
  const modeLabel = valuationMode === "minimum_guaranteed" ? "Minimum guaranteed annual value" : "Annual value";

  return {
    kicker: "CREDITCOMBO · OPTIMIZED",
    headline: cardCount > 1 ? "My optimized credit card lineup" : "My optimized credit card result",
    heroValue: new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0
    }).format(roundedNet),
    heroValueLabel: modeLabel,
    support: "Based on my spending profile across key categories.",
    cta: "Check your CreditCombo",
    nativeShareText: `I optimized my wallet with CreditCombo and estimated ${roundedNet.toLocaleString("en-CA")} CAD in annual value.`,
    urlLabel: siteHost || "creditcombo.ca"
  };
}
