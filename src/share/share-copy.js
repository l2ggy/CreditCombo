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

  const headline = isCurrent
    ? "I optimized my current wallet with CreditCombo"
    : "I found my ideal CreditCombo";

  const subheadline = hideSpend
    ? "Optimized earn rate across my spending mix."
    : (isCurrent
      ? "A smarter setup from cards I already hold."
      : "Built for higher annual rewards with the same spend habits.");

  if (hideSpend) {
    return {
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
    headline,
    subheadline,
    heroLabel,
    heroValue,
    supportLine,
    ctaText: "Check your CreditCombo"
  };
}
