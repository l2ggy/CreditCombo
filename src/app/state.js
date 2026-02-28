export function createUiState() {
  return {
    lockedCardIds: new Set(),
    valuationMode: "estimated",
    excludeFeeCards: false,
    excludeBusinessCards: false,
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

  if (state.excludeFeeCards) {
    additionalCards = additionalCards.filter((card) => Number(card.annual_fee?.amount ?? 0) <= 0);
  }

  if (state.excludeBusinessCards) {
    additionalCards = additionalCards.filter((card) => !card.is_business_card);
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
