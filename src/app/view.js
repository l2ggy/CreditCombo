export function createView() {
  ensureChexyFeeField();

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
    includeBusinessCardsEl: document.getElementById("includeBusinessCards"),
    excludeCashbackProgramsEl: document.getElementById("excludeCashbackPrograms"),
    maxAnnualFeeEl: document.getElementById("maxAnnualFee"),
    chexyFeePercentEl: document.getElementById("chexyFeePercent"),
    excludedProgramSearchEl: document.getElementById("excludedProgramSearch"),
    excludedProgramOptionsEl: document.getElementById("excludedProgramOptions"),
    excludedProgramPicksEl: document.getElementById("excludedProgramPicks"),
    resetAdvancedPrefsBtn: document.getElementById("resetAdvancedPrefsBtn"),
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
        elements.resultEl.classList.remove("resultEmpty");
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

function ensureChexyFeeField() {
  const existing = document.getElementById("chexyFeePercent");
  if (existing) return;

  const advancedBody = document.querySelector("#advancedPrefs .advancedPrefsBody");
  if (!advancedBody) return;

  const maxAnnualFee = document.getElementById("maxAnnualFee");
  const wrapper = document.createElement("div");
  wrapper.className = "advancedField";
  wrapper.innerHTML = `
    <label for="chexyFeePercent">Chexy fee (%)</label>
    <input id="chexyFeePercent" type="number" min="0" max="100" step="0.01" value="1.75" />
  `;

  if (maxAnnualFee?.nextSibling) {
    advancedBody.insertBefore(wrapper, maxAnnualFee.nextSibling);
  } else {
    advancedBody.append(wrapper);
  }
}
