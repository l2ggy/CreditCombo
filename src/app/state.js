export function createUiState() {
  return {
    lockedCardIds: new Set(),
    valuationMode: "estimated",
    maxAnnualFee: null,
    excludeBusinessCards: false,
    excludedProgramIds: new Set(),
    customProgramCpp: {},
    enableLockedCards: false,
    k: 1
  };
}

export function selectedLockedCardIds(state, eligibleCardIdSet) {
  if (!state.enableLockedCards) return [];
  return [...state.lockedCardIds].filter((id) => eligibleCardIdSet.has(id));
}

export function candidatePools(state, eligibleCards, eligibleCardIdSet) {
  const selectedIds = new Set(selectedLockedCardIds(state, eligibleCardIdSet));
  let additionalCards = eligibleCards.filter((card) => !selectedIds.has(card.id));

  if (Number.isFinite(state.maxAnnualFee)) {
    additionalCards = additionalCards.filter((card) => Number(card.annual_fee?.amount ?? 0) <= state.maxAnnualFee);
  }

  if (state.excludeBusinessCards) {
    additionalCards = additionalCards.filter((card) => !card.is_business_card);
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
