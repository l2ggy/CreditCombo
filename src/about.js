import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";
import { initAuthUi } from "./shared/auth.js";

async function main() {
  await initAuthUi();
  trackPageView("about");
  trackEvent("session_started", sessionEntryContext());
}

main();
