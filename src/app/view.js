export function createView() {
  const elements = {
    statusEl: document.getElementById("status"),
    appEl: document.getElementById("app"),
    spendTableEl: document.getElementById("spendTable"),
    clearSpendBtn: document.getElementById("clearSpendBtn"),
    issuesEl: document.getElementById("issues"),
    issuesWrapEl: document.getElementById("issuesWrap"),
    resultEl: document.getElementById("result"),
    runBtn: document.getElementById("runBtn"),
    valuationModeEl: document.getElementById("valuationMode"),
    excludeBusinessCardsEl: document.getElementById("excludeBusinessCards"),
    excludeCashbackProgramsEl: document.getElementById("excludeCashbackPrograms"),
    maxAnnualFeeEl: document.getElementById("maxAnnualFee"),
    programPrefsEl: document.getElementById("programPrefs"),
    enableLockedCardsEl: document.getElementById("enableLockedCards"),
    lockedCardsPanelEl: document.getElementById("lockedCardsPanel"),
    lockedCardSearchEl: document.getElementById("lockedCardSearch"),
    lockedCardOptionsEl: document.getElementById("lockedCardOptions"),
    lockedCardPicksEl: document.getElementById("lockedCardPicks"),
    lockedCardsDividerEl: document.getElementById("lockedCardsDivider"),
    kInput: document.getElementById("k"),
    kValueEl: document.getElementById("kValue"),
    kLabelEl: document.getElementById("kLabel")
  };

  return {
    elements,
    updateKValue(value) {
      if (elements.kValueEl) elements.kValueEl.textContent = String(value);
    },
    setLoadingState(isLoading) {
      elements.resultEl.classList.toggle("is-loading", isLoading);
      if (isLoading) {
        elements.resultEl.classList.remove("hidden");
        elements.resultEl.innerHTML = `
          <div class="loadingState" role="status" aria-live="polite">
            <span class="loadingSpinner" aria-hidden="true"></span>
            <span>Re-optimizing recommendations…</span>
          </div>
        `;
      }
    },
    syncIssuesVisibility(issueCount) {
      if (!elements.issuesWrapEl) return;
      if (issueCount) elements.issuesWrapEl.classList.remove("hidden");
      else elements.issuesWrapEl.classList.add("hidden");
    }
  };
}
