export const COMPARE_QUEUE_KEY = "creditcombo.compareQueue";

export function readComparisonQueue() {
  try {
    const raw = localStorage.getItem(COMPARE_QUEUE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return [...new Set(data.map(String))];
  } catch {
    return [];
  }
}

export function writeComparisonQueue(ids) {
  const deduped = [...new Set((ids || []).map(String))];
  localStorage.setItem(COMPARE_QUEUE_KEY, JSON.stringify(deduped));
  return deduped;
}

export function addToComparisonQueue(id) {
  const ids = readComparisonQueue();
  if (!ids.includes(id)) ids.push(id);
  return writeComparisonQueue(ids);
}
