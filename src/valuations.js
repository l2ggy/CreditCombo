import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";
import { initAuthUi } from "./shared/auth.js";

trackPageView("valuations");
trackEvent("session_started", sessionEntryContext());
initAuthUi({ mountEl: document.getElementById("authMount") });
