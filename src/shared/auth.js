import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_PROVIDER = "google";
let supabaseClient = null;
let missingConfigWarned = false;

function readConfig() {
  const config = window.CREDITCOMBO_CONFIG || {};
  return {
    SUPABASE_URL: typeof config.SUPABASE_URL === "string" ? config.SUPABASE_URL : "",
    SUPABASE_PUBLISHABLE_KEY: typeof config.SUPABASE_PUBLISHABLE_KEY === "string" ? config.SUPABASE_PUBLISHABLE_KEY : "",
    ENTITLEMENTS_API_ENABLED: Boolean(config.ENTITLEMENTS_API_ENABLED),
  };
}

function hasAuthConfig(config = readConfig()) {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY);
}

function warnMissingConfig() {
  if (missingConfigWarned) return;
  missingConfigWarned = true;
  console.warn("[auth] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in CREDITCOMBO_CONFIG.");
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const config = readConfig();
  if (!hasAuthConfig(config)) {
    warnMissingConfig();
    return null;
  }

  supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return supabaseClient;
}

export async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) return { error: new Error("Missing auth config") };

  return client.auth.signInWithOAuth({
    provider: SUPABASE_PROVIDER,
    options: {
      redirectTo: window.location.href,
    },
  });
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return { error: new Error("Missing auth config") };
  return client.auth.signOut();
}

export async function getSession() {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getSession();
  if (error) {
    console.warn("[auth] Failed to fetch session", error);
    return null;
  }

  return data?.session || null;
}

export function onAuthStateChange(handler) {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const subscription = client.auth.onAuthStateChange((_event, session) => {
    handler(session || null);
  });

  return () => {
    subscription.data.subscription.unsubscribe();
  };
}

function initialsFor(user) {
  const source = user?.user_metadata?.full_name || user?.email || "?";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function renderSignedOut(mountEl, { disabled = false } = {}) {
  mountEl.innerHTML = "";
  const signInBtn = document.createElement("button");
  signInBtn.type = "button";
  signInBtn.className = "authBtn";
  signInBtn.textContent = "Sign in";
  signInBtn.disabled = disabled;
  signInBtn.addEventListener("click", async () => {
    signInBtn.disabled = true;
    const { error } = await signInWithGoogle();
    if (error) {
      console.warn("[auth] Google sign-in failed", error);
      signInBtn.disabled = false;
    }
  });

  mountEl.append(signInBtn);
}

function renderSignedIn(mountEl, session) {
  mountEl.innerHTML = "";
  const user = session?.user;

  const wrapper = document.createElement("div");
  wrapper.className = "authSignedIn";

  const avatar = document.createElement("span");
  avatar.className = "authAvatar";
  avatar.textContent = initialsFor(user);

  const email = document.createElement("span");
  email.className = "authIdentity";
  email.textContent = user?.email || "Signed in";

  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.className = "authLink";
  signOutBtn.textContent = "Sign out";
  signOutBtn.addEventListener("click", async () => {
    signOutBtn.disabled = true;
    const { error } = await signOut();
    if (error) {
      console.warn("[auth] Sign-out failed", error);
      signOutBtn.disabled = false;
    }
  });

  wrapper.append(avatar, email, signOutBtn);
  mountEl.append(wrapper);
}

export async function initAuthUi({ mountEl }) {
  if (!(mountEl instanceof HTMLElement)) return () => {};

  const config = readConfig();
  if (!hasAuthConfig(config)) {
    renderSignedOut(mountEl, { disabled: true });
    warnMissingConfig();
    return () => {};
  }

  renderSignedOut(mountEl);
  const initialSession = await getSession();
  if (initialSession) {
    renderSignedIn(mountEl, initialSession);
  }

  const unsubscribe = onAuthStateChange((session) => {
    if (session) {
      renderSignedIn(mountEl, session);
      return;
    }
    renderSignedOut(mountEl);
  });

  return unsubscribe;
}
