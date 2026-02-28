export function formatMoneyCAD(value, { minimumFractionDigits = 2, maximumFractionDigits = 2 } = {}) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits,
    maximumFractionDigits
  }).format(safeValue);
}

export function formatMultiplier(value, significantDigits = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  if (numericValue === 0) return "0";

  const absValue = Math.abs(numericValue);
  const order = Math.floor(Math.log10(absValue));
  const scale = 10 ** (significantDigits - 1 - order);
  const roundedValue = Math.round(numericValue * scale) / scale;
  const fractionDigits = Math.max(0, significantDigits - 1 - order);

  return roundedValue.toFixed(fractionDigits).replace(/\.?0+$/, "");
}
