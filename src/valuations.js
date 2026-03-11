import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";
import { initAuthUi } from "./shared/auth.js";

async function main() {
  await initAuthUi();
  trackPageView("valuations");
  trackEvent("session_started", sessionEntryContext());
}

main();
