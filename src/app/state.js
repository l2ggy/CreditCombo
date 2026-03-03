export function createUiState() {
  return {
    mode: "ideal_combo",
    lockedCardIds: new Set(),
    valuationMode: "estimated",
    maxAnnualFee: null,
    chexyFeePercent: 1.75,
    includeBusinessCards: false,
    excludeCashbackPrograms: false,
    excludedProgramIds: new Set(),
    enableLockedCards: false,
    k: 1
  };
}

export function selectedLockedCardIds(state, eligibleCardIdSet) {
  if (!state.enableLockedCards) return [];
  return [...state.lockedCardIds].filter((id) => eligibleCardIdSet.has(id));
}

export function candidatePools(state, eligibleCards, eligibleCardIdSet, cashbackProgramIds = new Set()) {
  const selectedIds = new Set(selectedLockedCardIds(state, eligibleCardIdSet));
  let additionalCards = eligibleCards.filter((card) => !selectedIds.has(card.id));

  if (Number.isFinite(state.maxAnnualFee)) {
    additionalCards = additionalCards.filter((card) => Number(card.annual_fee?.amount ?? 0) <= state.maxAnnualFee);
  }

  if (!state.includeBusinessCards) {
    additionalCards = additionalCards.filter((card) => !card.is_business_card);
  }

  if (state.excludeCashbackPrograms) {
    additionalCards = additionalCards.filter((card) => !cashbackProgramIds.has(card.rewards_program));
  }

  if (state.excludedProgramIds?.size) {
    additionalCards = additionalCards.filter((card) => !state.excludedProgramIds.has(card.rewards_program));
  }

  return {
    selectedLockedIds: [...selectedIds],
    additionalCards
  };
}

export function kBounds(state, additionalCardsLength) {
  const max = Math.max(0, Math.min(5, additionalCardsLength));
  const baseMin = state.enableLockedCards ? 0 : 1;
  const min = max < baseMin ? 0 : baseMin;
  return { min, max };
}
