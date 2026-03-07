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

function inferAcquisitionChannel({ referrer, utmSource, utmMedium }) {
  const source = String(utmSource || "").toLowerCase();
  const medium = String(utmMedium || "").toLowerCase();
  if (source || medium) {
    if (source.includes("google") && medium.includes("cpc")) return "google_paid";
    if (source.includes("google")) return "google";
    if (source.includes("reddit") && medium.includes("cpc")) return "reddit_paid";
    if (source.includes("reddit")) return "reddit";
    if (medium.includes("email")) return "email";
    if (medium.includes("social") || source.includes("facebook") || source.includes("instagram") || source.includes("x")) return "social";
    return "campaign_other";
  }

  if (!referrer) return "direct";

  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host.includes("google.")) return "organic_google";
    if (host.includes("bing.")) return "organic_bing";
    if (host.includes("reddit.")) return "organic_reddit";
    if (host.includes("facebook.") || host.includes("instagram.")) return "organic_social";
    return "referral";
  } catch {
    return "unknown";
  }
}

export function sessionEntryContext() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const pick = (key) => {
    const value = params.get(key);
    return value ? value : undefined;
  };

  const referrer = document.referrer || undefined;
  const utmSource = pick("utm_source");
  const utmMedium = pick("utm_medium");

  return {
    entry_path: window.location.pathname,
    referrer,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: pick("utm_campaign"),
    utm_term: pick("utm_term"),
    utm_content: pick("utm_content"),
    gclid: pick("gclid"),
    fbclid: pick("fbclid"),
    ttclid: pick("ttclid"),
    msclkid: pick("msclkid"),
    acquisition_channel: inferAcquisitionChannel({ referrer, utmSource, utmMedium })
  };
}
