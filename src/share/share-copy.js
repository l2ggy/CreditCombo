import { formatMoneyCAD } from "../shared/format.js";

export function buildShareCopy({ netValue, cardCount, siteHost }) {
  const safeCount = Math.max(1, Number(cardCount) || 1);
  const kicker = "My optimized CreditCombo";
  const heroValue = formatMoneyCAD(Number(netValue) || 0);
  const headline = "My CreditCombo earns me";
  const heroValueLabel = "per year after fees. Tailored to your spend.";
  const cta = "Find your own CreditCombo";
  const urlLabel = siteHost || "creditcombo.ca";
  const nativeShareText = `My ${safeCount}-card CreditCombo earns me ${heroValue} per year after annual fees.`;

  return {
    kicker,
    headline,
    heroValue,
    heroValueLabel,
    cta,
    nativeShareText,
    urlLabel
  };
}
