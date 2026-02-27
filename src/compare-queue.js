const STORAGE_KEY = "creditcombo.compareQueue";

function loadRawQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function getCompareQueue(validIds = null) {
  const validSet = validIds ? new Set(validIds) : null;
  const deduped = [];
  const seen = new Set();

  for (const id of loadRawQueue()) {
    if (typeof id !== "string" || !id.trim()) continue;
    if (seen.has(id)) continue;
    if (validSet && !validSet.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }

  saveQueue(deduped);
  return deduped;
}

export function addToCompareQueue(cardId, validIds = null) {
  const id = String(cardId || "").trim();
  if (!id) return getCompareQueue(validIds);
  if (validIds && !new Set(validIds).has(id)) return getCompareQueue(validIds);
  const queue = getCompareQueue(validIds);
  if (!queue.includes(id)) queue.push(id);
  saveQueue(queue);
  return queue;
}

export function removeFromCompareQueue(cardId, validIds = null) {
  const id = String(cardId || "").trim();
  const queue = getCompareQueue(validIds).filter((item) => item !== id);
  saveQueue(queue);
  return queue;
}

export function clearCompareQueue() {
  saveQueue([]);
  return [];
}

export { STORAGE_KEY as compareQueueStorageKey };
