import { formatMoneyCAD } from "../shared/format.js";

export function buildShareCopy({ netValue, valuationMode, cardCount, siteHost }) {
  const safeCount = Math.max(1, Number(cardCount) || 1);
  const valueModeLabel = valuationMode === "minimum_guaranteed" ? "minimum guaranteed" : "estimated";

  const kicker = "CreditCombo optimizer result";
  const headline = `${safeCount} card${safeCount === 1 ? "" : "s"} tuned for your spend`;
  const heroValue = formatMoneyCAD(Number(netValue) || 0);
  const heroValueLabel = `Annual net value (${valueModeLabel})`;
  const support = "Built from your categories, annual fees, and Chexy-adjusted costs.";
  const cta = "Try your own scenario";
  const urlLabel = siteHost || "creditcombo.ca";
  const nativeShareText = `${headline} · ${heroValue} annual net value.`;

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
