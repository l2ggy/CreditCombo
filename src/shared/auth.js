import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabaseClient = null;
let authConfigMissingLogged = false;

function readAuthConfig() {
  const config = window.CREDITCOMBO_CONFIG;
  if (!config || !config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) {
    if (!authConfigMissingLogged) {
      authConfigMissingLogged = true;
      console.warn("Auth config unavailable; sign-in controls disabled.");
    }
    return null;
  }

  return config;
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const config = readAuthConfig();
  if (!config) return null;

  supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

export async function getSession() {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

export function onAuthStateChange(callback) {
  const client = getSupabaseClient();
  if (!client) return { unsubscribe() {} };

  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

export async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: "missing_config" };

  const redirectTo = window.location.href;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    console.error("Google sign-in failed", error);
    return { ok: false, reason: "oauth_start_failed" };
  }

  return { ok: true };
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return;

  const { error } = await client.auth.signOut();
  if (error) console.error("Sign out failed", error);
}

function authLabelForSession(session) {
  const email = session?.user?.email;
  if (!email) return "Signed in";
  return email;
}

function renderUnavailable(root) {
  root.innerHTML = "";
  const unavailable = document.createElement("span");
  unavailable.className = "subtle authUnavailable";
  unavailable.textContent = "Sign in unavailable";
  root.append(unavailable);
}

function renderSignedOut(root) {
  root.innerHTML = "";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "authActionBtn";
  button.textContent = "Sign in";
  button.addEventListener("click", () => signInWithGoogle());

  root.append(button);
}

function renderSignedIn(root, session) {
  root.innerHTML = "";

  const userLabel = document.createElement("span");
  userLabel.className = "subtle authUserLabel";
  userLabel.textContent = authLabelForSession(session);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "authActionBtn";
  button.textContent = "Sign out";
  button.addEventListener("click", () => signOut());

  root.append(userLabel, button);
}

function updateAuthUi(root, session) {
  if (!getSupabaseClient()) {
    renderUnavailable(root);
    return;
  }

  if (session) {
    renderSignedIn(root, session);
    return;
  }

  renderSignedOut(root);
}

export async function initAuthUi() {
  const root = document.querySelector("[data-auth-mount]");
  if (!root) return;

  root.classList.add("authMount");

  const session = await getSession();
  updateAuthUi(root, session);

  onAuthStateChange((nextSession) => {
    updateAuthUi(root, nextSession);
  });
}
