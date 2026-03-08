import { initAuthUi } from "./shared/auth.js";

export async function bootAuthShell(options = {}) {
  const authSlotEl = document.getElementById("authSlot");
  if (!authSlotEl) return () => {};

  return initAuthUi(authSlotEl, {
    onSession: options.onSession
  });
}
