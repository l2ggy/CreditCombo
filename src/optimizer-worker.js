import { findBestCombo } from "./optimizer.js";
import { normalizePrograms } from "./data.js";

self.addEventListener("message", (event) => {
  const { requestId, payload } = event.data || {};

  try {
    const programsMap = normalizePrograms(payload.programs || []);
    const result = findBestCombo({
      ...payload,
      programsMap
    });

    self.postMessage({ requestId, result });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
});
