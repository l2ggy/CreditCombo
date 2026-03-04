import { formatMoneyCAD } from "../shared/format.js";

export function buildShareCopy({ netValue, valuationMode, cardCount, siteHost }) {
  const safeCount = Math.max(1, Number(cardCount) || 1);
  const valueModeLabel = valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated";

  const kicker = "Your optimized CreditCombo";
  const heroValue = formatMoneyCAD(Number(netValue) || 0);
  const headline = `${safeCount}-card setup that earns:`;
  const heroValueLabel = `${valueModeLabel === "estimated" ? "Estimated" : "Minimum guaranteed"} net rewards per year, after annual fees`;
  const support = "Tailored to your personal spend profile.";
  const cta = "Find your own CreditCombo";
  const urlLabel = siteHost || "creditcombo.ca";
  const nativeShareText = `${headline} ${heroValue} a year after annual fees.`;

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
