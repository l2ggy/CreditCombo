const SUPABASE_JS_CDN = "https://esm.sh/@supabase/supabase-js@2";

let supabaseClientPromise = null;
let missingConfigLogged = false;

function runtimeConfig() {
  if (typeof window === "undefined") return {};
  return window.RUNTIME_CONFIG || window.__RUNTIME_CONFIG__ || window;
}

function resolveSupabaseConfig() {
  const config = runtimeConfig();
  return {
    url: String(config?.SUPABASE_URL || "").trim(),
    publishableKey: String(config?.SUPABASE_PUBLISHABLE_KEY || "").trim()
  };
}

function logMissingConfigOnce() {
  if (missingConfigLogged) return;
  missingConfigLogged = true;
  console.warn("[auth] Supabase auth is disabled: missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY runtime config.");
}

async function getSupabaseClient() {
  if (supabaseClientPromise) return supabaseClientPromise;

  const { url, publishableKey } = resolveSupabaseConfig();
  if (!url || !publishableKey) {
    logMissingConfigOnce();
    return null;
  }

  supabaseClientPromise = import(SUPABASE_JS_CDN)
    .then(({ createClient }) => createClient(url, publishableKey))
    .catch((error) => {
      supabaseClientPromise = null;
      console.warn("[auth] Failed to initialize Supabase client.", error);
      return null;
    });

  return supabaseClientPromise;
}

export async function signInWithGoogle({ redirectTo } = {}) {
  const client = await getSupabaseClient();
  if (!client) return { data: null, error: new Error("Supabase auth is not configured") };
  return client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo || window.location.href
    }
  });
}

export async function signOut() {
  const client = await getSupabaseClient();
  if (!client) return { error: null };
  return client.auth.signOut();
}

export async function getSession() {
  const client = await getSupabaseClient();
  if (!client) return { data: { session: null }, error: null };
  return client.auth.getSession();
}

export async function onAuthStateChange(callback) {
  const client = await getSupabaseClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback?.(event, session);
  });

  return () => data?.subscription?.unsubscribe?.();
}

function initialsFor(user) {
  const label = user?.user_metadata?.name || user?.email || "You";
  const [first = "", second = ""] = String(label).trim().split(/\s+/);
  return `${first[0] || ""}${second[0] || ""}`.toUpperCase() || "U";
}

function shortLabelFor(user) {
  const fullName = String(user?.user_metadata?.name || "").trim();
  if (fullName) return fullName.split(/\s+/)[0];
  const email = String(user?.email || "").trim();
  if (!email) return "Account";
  return email.split("@")[0].slice(0, 12);
}

export async function initAuthUi(container, options = {}) {
  if (!(container instanceof HTMLElement)) return { destroy: () => {} };

  const { url, publishableKey } = resolveSupabaseConfig();
  if (!url || !publishableKey) {
    container.hidden = true;
    logMissingConfigOnce();
    return { destroy: () => {} };
  }

  container.hidden = false;
  container.classList.add("authUi");
  container.innerHTML = `
    <button type="button" class="authAction authAction--signedOut textLink">Sign in</button>
    <button type="button" class="authAction authAction--signedIn hidden" aria-label="Account menu">
      <span class="authAvatar" aria-hidden="true"></span>
      <span class="authLabel"></span>
    </button>
  `;

  const signedOutBtn = container.querySelector(".authAction--signedOut");
  const signedInBtn = container.querySelector(".authAction--signedIn");
  const avatarEl = container.querySelector(".authAvatar");
  const labelEl = container.querySelector(".authLabel");

  const onSignIn = async () => {
    await signInWithGoogle({ redirectTo: options.redirectTo || window.location.href });
  };

  const onSignedInAction = async () => {
    await signOut();
  };

  signedOutBtn?.addEventListener("click", onSignIn);
  signedInBtn?.addEventListener("click", onSignedInAction);

  const render = (session) => {
    const user = session?.user;
    const isSignedIn = Boolean(user);
    signedOutBtn?.classList.toggle("hidden", isSignedIn);
    signedInBtn?.classList.toggle("hidden", !isSignedIn);

    if (!isSignedIn) return;
    if (avatarEl) avatarEl.textContent = initialsFor(user);
    if (labelEl) labelEl.textContent = shortLabelFor(user);
  };

  const { data } = await getSession();
  render(data?.session || null);

  const unsubscribe = await onAuthStateChange((event, session) => {
    render(session);
    options.onAuthStateChange?.(event, session);
  });

  return {
    destroy: () => {
      unsubscribe?.();
      signedOutBtn?.removeEventListener("click", onSignIn);
      signedInBtn?.removeEventListener("click", onSignedInAction);
    }
  };
}
