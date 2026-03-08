import { initAuthUi, onAuthStateChange } from "./auth.js";

export function bootAuthUi() {
  const authSlot = document.getElementById("authSlot");
  if (!authSlot) return;

  const authUi = initAuthUi(authSlot);
  const subscription = onAuthStateChange(() => {
    authUi.refresh();
  });

  window.addEventListener("beforeunload", () => {
    subscription.unsubscribe();
  }, { once: true });
}
