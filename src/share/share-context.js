export function buildShareContext(best, chexySummary, shareUrl) {
  if (!best?.combo?.length) return null;
  return {
    best,
    netAfterChexy: Number(best.net || 0) - Number(chexySummary?.chexyAdjustedAnnualSpend || 0),
    shareUrl
  };
}
