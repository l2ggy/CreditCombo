import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";
import { initAuthUi } from "./shared/auth.js";

async function init() {
  const authMountEl = document.getElementById("authMount");
  await initAuthUi({ mountEl: authMountEl });

  trackPageView("about");
  trackEvent("session_started", sessionEntryContext());
}

init();
