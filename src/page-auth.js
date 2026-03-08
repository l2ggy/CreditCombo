import { getSession, initAuthUi, onAuthStateChange } from "./shared/auth.js";

async function initPageAuth() {
  const authSlot = document.getElementById("authSlot");
  const authUi = initAuthUi(authSlot, { redirectTo: window.location.href.split("#")[0] });
  authUi.update(await getSession());
  onAuthStateChange((_, session) => authUi.update(session));
}

initPageAuth();
