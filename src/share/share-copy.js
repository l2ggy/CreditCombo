import { formatMoneyCAD } from "../shared/format.js";

export function buildShareCopy({ netValue }) {
  const kicker = "My optimized CreditCombo";
  const heroValue = formatMoneyCAD(Number(netValue) || 0);
  const headline = "My CreditCombo earns me";
  const heroValueLabel = "per year. Find yours:";
  const cta = "Find your own CreditCombo";
  const nativeShareText = `${headline} ${heroValue} per year. Find yours:`;

  return {
    kicker,
    headline,
    heroValue,
    heroValueLabel,
    cta,
    nativeShareText
  };
}
