function hasGtag() {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

function inferPageType() {
  if (typeof window === "undefined") return "unknown";
  const path = window.location.pathname;
  if (path === "/" || path.endsWith("/index.html")) return "optimizer";
  if (path.includes("quick-setup")) return "quick_setup";
  if (path.includes("cards")) return "card_browser";
  if (path.includes("valuations")) return "valuations";
  return "unknown";
}

function withCommonMetadata(params = {}) {
  return {
    page_type: inferPageType(),
    ...params,
    page_path: typeof window !== "undefined" ? window.location.pathname : "",
    timestamp_ms: Date.now()
  };
}

export function trackEvent(eventName, params = {}) {
  if (!eventName || !hasGtag()) return;
  window.gtag("event", eventName, withCommonMetadata(params));
}

export function trackPageView(pageType) {
  if (!hasGtag()) return;
  window.gtag("event", "page_view", withCommonMetadata({ page_type: pageType }));
}

export function sessionEntryContext() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const pick = (key) => {
    const value = params.get(key);
    return value ? value : undefined;
  };

  return {
    entry_path: window.location.pathname,
    referrer: document.referrer || undefined,
    utm_source: pick("utm_source"),
    utm_medium: pick("utm_medium"),
    utm_campaign: pick("utm_campaign")
  };
}
