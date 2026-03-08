import { sessionEntryContext, trackEvent, trackPageView } from "./shared/analytics.js";
import { initAuthUi } from "./shared/auth.js";

initAuthUi({ mountEl: document.getElementById("auth-controls") });
trackPageView("about");
trackEvent("session_started", sessionEntryContext());
