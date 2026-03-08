import { initAuthUi } from "./shared/auth.js";
import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";

initAuthUi({ mountEl: document.getElementById("auth-controls") });
trackPageView("valuations");
trackEvent("session_started", sessionEntryContext());
