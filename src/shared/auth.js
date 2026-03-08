import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let cachedClient = null;
let warnedMissingConfig = false;

function readRuntimeConfig() {
  const candidate = globalThis.__RUNTIME_CONFIG__
    || globalThis.RUNTIME_CONFIG
    || globalThis.runtimeConfig
    || {};

  return {
    supabaseUrl: String(candidate.SUPABASE_URL || globalThis.SUPABASE_URL || "").trim(),
    supabasePublishableKey: String(candidate.SUPABASE_PUBLISHABLE_KEY || globalThis.SUPABASE_PUBLISHABLE_KEY || "").trim()
  };
}

function getAuthClient() {
  if (cachedClient) return cachedClient;

  const { supabaseUrl, supabasePublishableKey } = readRuntimeConfig();
  if (!supabaseUrl || !supabasePublishableKey) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn("Auth config missing: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to enable auth UI.");
    }
    return null;
  }

  cachedClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return cachedClient;
}

function displayNameForUser(user) {
  const metadata = user?.user_metadata || {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const firstName = typeof metadata.given_name === "string" ? metadata.given_name.trim() : "";
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  if (firstName) return firstName;
  if (fullName) return fullName.split(/\s+/)[0];
  if (email) return email.split("@")[0];
  return "Account";
}

function avatarUrlForUser(user) {
  const metadata = user?.user_metadata || {};
  return typeof metadata.avatar_url === "string" && metadata.avatar_url.trim()
    ? metadata.avatar_url.trim()
    : "";
}

export async function signInWithGoogle(options = {}) {
  const client = getAuthClient();
  if (!client) return { data: null, error: null };

  const redirectTo = String(options.redirectTo || window.location.href.split("#")[0] || "").trim();
  return client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account"
      }
    }
  });
}

export async function signOut() {
  const client = getAuthClient();
  if (!client) return { error: null };
  return client.auth.signOut();
}

export async function getSession() {
  const client = getAuthClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.warn("Unable to read auth session", error);
    return null;
  }
  return data?.session || null;
}

export function onAuthStateChange(callback) {
  const client = getAuthClient();
  if (!client || typeof callback !== "function") return () => {};

  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session || null);
  });

  return () => data?.subscription?.unsubscribe();
}

export function initAuthUi(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    return {
      update: () => {},
      setDisabled: () => {}
    };
  }

  const client = getAuthClient();
  if (!client) {
    container.classList.add("is-hidden");
    container.setAttribute("aria-hidden", "true");
    return {
      update: () => {},
      setDisabled: () => {}
    };
  }

  let isBusy = false;
  let activeSession = null;

  function renderSignedOut() {
    container.classList.remove("is-hidden");
    container.removeAttribute("aria-hidden");
    container.innerHTML = '<button type="button" class="authInlineBtn textLink" data-auth-action="sign-in">Sign in</button>';

    const signInBtn = container.querySelector("[data-auth-action='sign-in']");
    signInBtn?.addEventListener("click", async () => {
      if (isBusy) return;
      isBusy = true;
      signInBtn.setAttribute("disabled", "disabled");

      try {
        const redirectTo = String(options.redirectTo || window.location.href.split("#")[0] || "").trim();
        const { error } = await signInWithGoogle({ redirectTo });
        if (error) console.warn("Unable to start sign in", error);
      } finally {
        isBusy = false;
        signInBtn.removeAttribute("disabled");
      }
    });
  }

  function renderSignedIn(session) {
    const user = session?.user || {};
    const label = displayNameForUser(user);
    const avatarUrl = avatarUrlForUser(user);
    const avatarInitial = label.slice(0, 1).toUpperCase();
    const avatarMarkup = avatarUrl
      ? `<img class="authAvatar" src="${avatarUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : `<span class="authAvatar authAvatarFallback" aria-hidden="true">${avatarInitial}</span>`;

    container.classList.remove("is-hidden");
    container.removeAttribute("aria-hidden");
    container.innerHTML = `
      <div class="authUserMenu">
        ${avatarMarkup}
        <span class="authUserLabel" title="Signed in as ${user?.email || label}">${label}</span>
        <button type="button" class="authInlineBtn textLink" data-auth-action="sign-out">Sign out</button>
      </div>
    `;

    container.querySelector("[data-auth-action='sign-out']")?.addEventListener("click", async () => {
      if (isBusy) return;
      isBusy = true;
      try {
        const { error } = await signOut();
        if (error) console.warn("Unable to sign out", error);
      } finally {
        isBusy = false;
      }
    });
  }

  return {
    update(session) {
      activeSession = session || null;
      if (!activeSession?.user) {
        renderSignedOut();
        return;
      }
      renderSignedIn(activeSession);
    },
    setDisabled(disabled) {
      container.classList.toggle("is-hidden", Boolean(disabled));
      if (disabled) container.setAttribute("aria-hidden", "true");
      else container.removeAttribute("aria-hidden");
    }
  };
}
