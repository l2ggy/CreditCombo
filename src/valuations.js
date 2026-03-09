import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";
import { initAuthUi } from "./shared/auth.js";

async function init() {
  trackPageView("valuations");
  trackEvent("session_started", sessionEntryContext());
  await initAuthUi({ mountEl: document.querySelector("#authMount") });
}

init();
