import { initAuthUi } from "./shared/auth.js";
import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";

initAuthUi({ mountEl: document.getElementById("auth-controls") });
trackPageView("about");
trackEvent("session_started", sessionEntryContext());
