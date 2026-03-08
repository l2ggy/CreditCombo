const SUPABASE_CLIENT_MODULE_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let supabaseClientPromise = null;

function readRuntimeConfig() {
  const runtimeConfig = window.__RUNTIME_CONFIG__ || window.RUNTIME_CONFIG || {};
  const metaUrl = document.querySelector('meta[name="supabase-url"]')?.content;
  const metaKey = document.querySelector('meta[name="supabase-publishable-key"]')?.content;

  return {
    supabaseUrl: String(runtimeConfig.SUPABASE_URL || metaUrl || "").trim(),
    supabasePublishableKey: String(runtimeConfig.SUPABASE_PUBLISHABLE_KEY || metaKey || "").trim()
  };
}

function hasAuthConfig() {
  const { supabaseUrl, supabasePublishableKey } = readRuntimeConfig();
  return Boolean(supabaseUrl && supabasePublishableKey);
}

async function getSupabaseClient() {
  if (supabaseClientPromise) return supabaseClientPromise;

  if (!hasAuthConfig()) {
    console.warn("[auth] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Auth UI will stay hidden.");
    return null;
  }

  const { supabaseUrl, supabasePublishableKey } = readRuntimeConfig();

  supabaseClientPromise = import(SUPABASE_CLIENT_MODULE_URL)
    .then(({ createClient }) => createClient(supabaseUrl, supabasePublishableKey))
    .catch((error) => {
      console.warn("[auth] Failed to initialize Supabase client.", error);
      return null;
    });

  return supabaseClientPromise;
}

export async function signInWithGoogle() {
  const client = await getSupabaseClient();
  if (!client) return { error: new Error("Auth is unavailable") };

  return client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href
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
  if (!client) return null;

  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn("[auth] Failed to read session.", error);
      return null;
    }
    return data?.session || null;
  } catch (error) {
    console.warn("[auth] Failed to read session.", error);
    return null;
  }
}

export async function onAuthStateChange(callback) {
  const client = await getSupabaseClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });

  return () => data.subscription.unsubscribe();
}

function initialsFor(user) {
  const fullName = String(user?.user_metadata?.full_name || user?.email || "U").trim();
  const words = fullName.split(/\s+/).filter(Boolean);
  if (!words.length) return "U";
  return words.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function shortLabelFor(user) {
  const raw = String(user?.user_metadata?.full_name || user?.email || "Account").trim();
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 17)}…`;
}

export async function initAuthUi(container, options = {}) {
  if (!container) return () => {};

  container.classList.add("authSlot");

  if (!hasAuthConfig()) {
    container.hidden = true;
    container.setAttribute("aria-hidden", "true");
    return () => {};
  }

  container.hidden = false;
  container.removeAttribute("aria-hidden");

  const renderSignedOut = () => {
    container.innerHTML = '<button type="button" class="authTextButton" data-auth-action="signin">Sign in</button>';
    container.querySelector('[data-auth-action="signin"]')?.addEventListener("click", async () => {
      const { error } = await signInWithGoogle();
      if (error) console.warn("[auth] Sign-in failed.", error);
    });
  };

  const renderSignedIn = (session) => {
    const user = session?.user;
    container.innerHTML = `
      <div class="authUserMenu">
        <span class="authAvatar" aria-hidden="true">${initialsFor(user)}</span>
        <span class="authLabel">${shortLabelFor(user)}</span>
        <button type="button" class="authTextButton" data-auth-action="signout">Sign out</button>
      </div>
    `;

    container.querySelector('[data-auth-action="signout"]')?.addEventListener("click", async () => {
      const { error } = await signOut();
      if (error) console.warn("[auth] Sign-out failed.", error);
    });
  };

  const render = (session) => {
    if (session?.user) {
      renderSignedIn(session);
      options.onSession?.(session);
      return;
    }
    renderSignedOut();
    options.onSession?.(null);
  };

  render(await getSession());
  return onAuthStateChange((session) => render(session));
}
