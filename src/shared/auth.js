import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabaseClient = null;
let authConfig = null;

function resolveConfig() {
  const rawConfig = window.CREDITCOMBO_CONFIG || null;
  if (!rawConfig?.SUPABASE_URL || !rawConfig?.SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  return {
    supabaseUrl: rawConfig.SUPABASE_URL,
    publishableKey: rawConfig.SUPABASE_PUBLISHABLE_KEY,
  };
}

function getClient() {
  if (supabaseClient) return supabaseClient;

  authConfig = resolveConfig();
  if (!authConfig) return null;

  supabaseClient = createClient(authConfig.supabaseUrl, authConfig.publishableKey);
  return supabaseClient;
}

export async function getSession() {
  const client = getClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  return data?.session || null;
}

export function onAuthStateChange(callback) {
  const client = getClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });

  return () => data?.subscription?.unsubscribe();
}

export async function signInWithGoogle() {
  const client = getClient();
  if (!client) {
    throw new Error("Auth is unavailable.");
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href },
  });

  if (error) throw error;
}

export async function signOut() {
  const client = getClient();
  if (!client) return;
  await client.auth.signOut();
}

function renderUnavailable(container) {
  container.innerHTML = "";
  const label = document.createElement("span");
  label.className = "authStatus authStatus-muted";
  label.textContent = "Sign in unavailable";
  container.append(label);
  console.warn("Auth configuration is missing; sign-in controls are disabled.");
}

function renderAuthenticated(container, session) {
  container.innerHTML = "";
  const email = session?.user?.email || "Signed in";

  const status = document.createElement("span");
  status.className = "authStatus";
  status.textContent = email;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "authButton";
  button.textContent = "Sign out";
  button.addEventListener("click", () => {
    signOut();
  });

  container.append(status, button);
}

function renderSignedOut(container) {
  container.innerHTML = "";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "authButton";
  button.textContent = "Sign in";
  button.addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Google sign-in failed", error);
    }
  });

  container.append(button);
}

export async function initAuthUi() {
  const mount = document.querySelector("[data-auth-ui]");
  if (!mount) return;

  if (!getClient()) {
    renderUnavailable(mount);
    return;
  }

  const session = await getSession();
  if (session) renderAuthenticated(mount, session);
  else renderSignedOut(mount);

  onAuthStateChange((nextSession) => {
    if (nextSession) renderAuthenticated(mount, nextSession);
    else renderSignedOut(mount);
  });
}
