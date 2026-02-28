import { findBestCombo } from "./optimizer.js";
import { normalizePrograms } from "./data.js";

self.onmessage = (event) => {
  const {
    cards,
    programsJson,
    schema,
    k,
    annualSpend,
    valuationMode,
    lockedCardIds,
    additionalCardIds,
    requestId,
  } = event.data || {};

  try {
    const programsMap = normalizePrograms(programsJson);
    const best = findBestCombo({
      cards,
      programsMap,
      schema,
      k,
      annualSpend,
      valuationMode,
      lockedCardIds,
      additionalCardIds,
    });

    self.postMessage({ requestId, best });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
