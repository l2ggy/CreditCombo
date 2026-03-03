import { buildOptimizerDeepLink } from "../app/deeplink.js";

export function buildSharePayload({ mode = "ideal_combo", deepLinkState = {}, copy = {} } = {}) {
  const restorablePath = buildOptimizerDeepLink({ ...deepLinkState, mode });
  const restorableUrl = new URL(restorablePath, window.location.href).toString();
  const publicCtaUrl = new URL("./quick-setup.html", window.location.href).toString();

  return {
    title: "My CreditCombo",
    text: `${copy.headline || "My CreditCombo"} · ${copy.heroValue || ""}`.trim(),
    restorableUrl,
    publicCtaUrl,
    qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(publicCtaUrl)}`
  };
}
