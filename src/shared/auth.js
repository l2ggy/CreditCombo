import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const CONFIG = window.CREDITCOMBO_CONFIG || {};
const SUPABASE_URL = CONFIG.SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY || "";

let warnedMissingConfig = false;
let supabaseClient = null;
let authUiCleanup = null;

function hasConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function warnMissingConfig() {
  if (warnedMissingConfig) return;
  warnedMissingConfig = true;
  console.warn("Auth is disabled: missing runtime Supabase config.");
}

function getSupabaseClient() {
  if (!hasConfig()) {
    warnMissingConfig();
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}

export async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) return { error: new Error("auth_config_missing") };

  return client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href,
    },
  });
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return { error: null };
  return client.auth.signOut();
}

export async function getSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.warn("Failed to get auth session", error);
    return null;
  }
  return data?.session || null;
}

export function onAuthStateChange(callback) {
  const client = getSupabaseClient();
  if (!client) {
    callback("SIGNED_OUT", null);
    return () => {};
  }

  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session || null);
  });

  return () => data?.subscription?.unsubscribe();
}

function initialsFor(user) {
  const email = String(user?.email || "").trim();
  if (!email) return "U";
  return email.slice(0, 1).toUpperCase();
}

function renderSignedOut(container) {
  container.innerHTML = `
    <button type="button" class="authControl authControl-signin" data-auth-signin>
      Sign in
    </button>
  `;

  container.querySelector("[data-auth-signin]")?.addEventListener("click", () => {
    signInWithGoogle();
  });
}

function renderSignedIn(container, session) {
  const user = session?.user || {};
  const email = user.email || "Signed in";
  container.innerHTML = `
    <span class="authUser" title="${email}">
      <span class="authAvatar" aria-hidden="true">${initialsFor(user)}</span>
      <span class="authEmail">${email}</span>
    </span>
    <button type="button" class="authControl authControl-signout" data-auth-signout>
      Sign out
    </button>
  `;

  container.querySelector("[data-auth-signout]")?.addEventListener("click", () => {
    signOut();
  });
}

function renderDisabled(container) {
  container.innerHTML = `
    <button type="button" class="authControl" disabled title="Sign-in is not configured yet">
      Sign in
    </button>
  `;
}

export function initAuthUi({ mountEl }) {
  if (!mountEl) return;

  if (authUiCleanup) {
    authUiCleanup();
    authUiCleanup = null;
  }

  mountEl.classList.add("authMount");

  if (!hasConfig()) {
    renderDisabled(mountEl);
    warnMissingConfig();
    return;
  }

  mountEl.innerHTML = "";

  const syncUi = (session) => {
    if (session?.user) {
      renderSignedIn(mountEl, session);
      return;
    }
    renderSignedOut(mountEl);
  };

  getSession().then((session) => {
    syncUi(session);
  });

  authUiCleanup = onAuthStateChange((_event, session) => {
    syncUi(session);
  });
}
