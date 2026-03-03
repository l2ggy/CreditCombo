import { buildOptimizerDeepLink } from "../app/deeplink.js";

const PUBLIC_QUICK_SETUP_URL = "https://creditcombo.kafidov.dev/quick-setup";

export function buildSharePayload({ mode = "ideal_combo", deepLinkState = {}, copy = {} } = {}) {
  const restorablePath = buildOptimizerDeepLink({ ...deepLinkState, mode });
  const restorableUrl = new URL(restorablePath, window.location.href).toString();
  const publicCtaUrl = PUBLIC_QUICK_SETUP_URL;

  return {
    title: "My CreditCombo",
    text: `${copy.headline || "My CreditCombo"} · ${copy.heroValue || ""}`.trim(),
    restorableUrl,
    publicCtaUrl,
    qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(publicCtaUrl)}`
  };
}
