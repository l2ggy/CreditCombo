import { formatMoneyCAD } from "../shared/format.js";

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function buildShareCopy({ mode = "ideal_combo", privacyMode = "full", metrics = {} } = {}) {
  const isCurrent = mode === "current_cards";
  const hideSpend = privacyMode === "earn_rate_only";
  const uplift = Number(metrics.uplift || 0);
  const kicker = isCurrent ? "My CreditCombo" : "My ideal CreditCombo";

  const headline = isCurrent
    ? "Optimized from the cards I already have"
    : "Optimized for higher annual rewards";

  const subheadline = hideSpend
    ? "Shared in privacy mode: earn-rate view only."
    : (isCurrent
      ? "My current-wallet setup, tuned for better outcomes."
      : "My best setup from this spending profile.");

  if (hideSpend) {
    return {
      kicker,
      headline,
      subheadline,
      heroLabel: "Effective earn rate",
      heroValue: formatPercent(metrics.effectiveEarnRate),
      supportLine: `Gross earn rate: ${formatPercent(metrics.grossEarnRate)}`,
      ctaText: "Check your CreditCombo"
    };
  }

  const heroLabel = isCurrent ? "Current combo annual net value" : "Annual net value";
  const heroValue = formatMoneyCAD(metrics.netAfterChexy || 0);
  const supportLine = isCurrent && uplift > 0
    ? `Potential upside: +${formatMoneyCAD(uplift)} / year`
    : `Effective earn rate: ${formatPercent(metrics.effectiveEarnRate)}`;

  return {
    kicker,
    headline,
    subheadline,
    heroLabel,
    heroValue,
    supportLine,
    ctaText: "Check your CreditCombo"
  };
}
