import { formatMoneyCAD } from "../shared/format.js";

export function buildShareCopy({ netValue, valuationMode, cardCount, siteHost }) {
  const safeCount = Math.max(1, Number(cardCount) || 1);
  const valueModeLabel = valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated";

  const kicker = "Your optimized CreditCombo";
  const heroValue = formatMoneyCAD(Number(netValue) || 0);
  const headline = `${safeCount}-card setup, built for this spend profile`;
  const heroValueLabel = `${valueModeLabel === "estimated" ? "Estimated" : "Minimum guaranteed"} yearly net rewards`;
  const support = "After annual card fees and Chexy costs.";
  const cta = "Try your own scenario";
  const urlLabel = siteHost || "creditcombo.ca";
  const nativeShareText = `${headline} · ${heroValue}/year net rewards.`;

  return {
    kicker,
    headline,
    heroValue,
    heroValueLabel,
    support,
    cta,
    nativeShareText,
    urlLabel
  };
}
