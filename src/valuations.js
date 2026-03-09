import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";
import { initAuthUi } from "./shared/auth.js";

async function init() {
  await initAuthUi({ mountEl: document.getElementById("authMount") });
  trackPageView("valuations");
  trackEvent("session_started", sessionEntryContext());
}

init();
