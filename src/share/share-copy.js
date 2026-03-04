import { formatMoneyCAD } from "../shared/format.js";

export function buildShareCopy({ netValue, valuationMode, cardCount, siteHost }) {
  const safeCount = Math.max(1, Number(cardCount) || 1);
  const valueModeLabel = valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated";

  const kicker = "Your optimized CreditCombo";
  const heroValue = formatMoneyCAD(Number(netValue) || 0);
  const cardLabel = `${safeCount} card${safeCount === 1 ? "" : "s"}`;
  const headline = `CreditCombo found a ${cardLabel} to earn you:`;
  const heroValueLabel = `${valueModeLabel === "estimated" ? "Estimated" : "Minimum guaranteed"} net rewards per year, after annual fees`;
  const support = "";
  const cta = "Try your own scenario";
  const urlLabel = siteHost || "creditcombo.ca";
  const nativeShareText = `${headline} · earning ${heroValue} a year after annual fees.`;

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
