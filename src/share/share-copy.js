import { formatMoneyCAD } from "../shared/format.js";

export function buildShareCopy({ netValue, cardCount }) {
  const safeCount = Math.max(1, Number(cardCount) || 1);
  const kicker = "My optimized CreditCombo";
  const heroValue = formatMoneyCAD(Number(netValue) || 0);
  const headline = `My ${safeCount}-card CreditCombo earns me:`;
  const heroValueLabel = "Per year after fees. Tailored to my spend.";
  const cta = "Find your own CreditCombo";
  const nativeShareText = `${headline} ${heroValue} per year after annual fees.`;

  return {
    kicker,
    headline,
    heroValue,
    heroValueLabel,
    cta,
    nativeShareText
  };
}
