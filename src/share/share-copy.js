import { formatMoneyCAD } from "../shared/format.js";

export function buildShareCopy({ netValue, valuationMode, cardCount, siteHost }) {
  const safeCount = Math.max(1, Number(cardCount) || 1);
  const kicker = "Your optimized CreditCombo";
  const heroValue = formatMoneyCAD(Number(netValue) || 0);
  const headline = `${safeCount}-card setup that earns:`;
  const heroValueLabel = `Per year after fees. Tailored to your spend.`;
  const support = "";
  const cta = "Find your own CreditCombo";
  const urlLabel = siteHost || "creditcombo.ca";
  const nativeShareText = `${headline} ${heroValue} per year after fees, tailored to your spend.`;

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
