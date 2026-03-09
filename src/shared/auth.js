const SESSION_STORAGE_KEY = "creditcombo.supabase.session";

const listeners = new Set();
let authClient = null;
let currentSession = null;
let initialized = false;

function readConfig() {
  const config = window.CREDITCOMBO_CONFIG || {};
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) return null;
  return config;
}

function parseHashSession() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const expiresIn = Number(hash.get("expires_in") || 3600);

  if (!accessToken || !refreshToken) return null;
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: hash.get("token_type") || "bearer",
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: {
      id: hash.get("user_id") || null,
      email: hash.get("email") || "",
    },
  };
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token || !parsed?.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeSession(session) {
  currentSession = session || null;
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}

function notify(event, session) {
  listeners.forEach((listener) => {
    try {
      listener(event, session);
    } catch (error) {
      console.error("Auth state listener failed", error);
    }
  });
}

async function hydrateUser(config, session) {
  if (!session?.access_token) return session;

  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: config.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) return session;
  const user = await response.json();
  return { ...session, user };
}

async function refreshSession(config, session) {
  if (!session?.refresh_token) return null;

  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  if (!response.ok) return null;
  const refreshed = await response.json();
  return {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || session.refresh_token,
    expires_at: refreshed.expires_at,
    token_type: refreshed.token_type || "bearer",
    user: refreshed.user || session.user || null,
  };
}

async function ensureInit() {
  if (initialized) return;
  initialized = true;

  const config = readConfig();
  if (!config) return;

  authClient = {
    config,
  };

  const hashSession = parseHashSession();
  if (hashSession) {
    const hydrated = await hydrateUser(config, hashSession);
    storeSession(hydrated);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    notify("SIGNED_IN", hydrated);
    return;
  }

  const stored = readStoredSession();
  if (!stored) return;

  const now = Math.floor(Date.now() / 1000);
  if (Number(stored.expires_at || 0) <= now + 30) {
    const refreshed = await refreshSession(config, stored);
    if (!refreshed) {
      storeSession(null);
      notify("SIGNED_OUT", null);
      return;
    }
    const hydrated = await hydrateUser(config, refreshed);
    storeSession(hydrated);
    notify("TOKEN_REFRESHED", hydrated);
    return;
  }

  const hydrated = await hydrateUser(config, stored);
  storeSession(hydrated);
}

export async function signInWithGoogle() {
  await ensureInit();
  if (!authClient?.config) return;

  const target = new URL(`${authClient.config.SUPABASE_URL}/auth/v1/authorize`);
  target.searchParams.set("provider", "google");
  target.searchParams.set("redirect_to", window.location.href);
  window.location.assign(target.toString());
}

export async function signOut() {
  await ensureInit();
  if (!authClient?.config || !currentSession?.access_token) {
    storeSession(null);
    notify("SIGNED_OUT", null);
    return;
  }

  try {
    await fetch(`${authClient.config.SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentSession.access_token}`,
        apikey: authClient.config.SUPABASE_PUBLISHABLE_KEY,
      },
    });
  } catch {
    // Network errors should not block local sign-out state.
  }

  storeSession(null);
  notify("SIGNED_OUT", null);
}

export async function getSession() {
  await ensureInit();
  return currentSession;
}

export function onAuthStateChange(callback) {
  listeners.add(callback);
  return {
    unsubscribe() {
      listeners.delete(callback);
    },
  };
}

function buildSignedOutUi(container) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "authControl authControl-signin";
  button.textContent = "Sign in";
  button.addEventListener("click", () => {
    signInWithGoogle().catch((error) => {
      console.warn("Sign-in failed", error);
    });
  });
  container.replaceChildren(button);
}

function buildSignedInUi(container, session) {
  const wrap = document.createElement("div");
  wrap.className = "authSignedIn";

  const identity = document.createElement("span");
  identity.className = "authIdentity";
  const email = session?.user?.email || "Signed in";
  identity.textContent = email;

  const signOutButton = document.createElement("button");
  signOutButton.type = "button";
  signOutButton.className = "authControl authControl-signout";
  signOutButton.textContent = "Sign out";
  signOutButton.addEventListener("click", () => {
    signOut().catch((error) => {
      console.warn("Sign-out failed", error);
    });
  });

  wrap.append(identity, signOutButton);
  container.replaceChildren(wrap);
}

export async function initAuthUi({ mountEl }) {
  if (!(mountEl instanceof HTMLElement)) return;

  await ensureInit();
  if (!authClient?.config) {
    mountEl.innerHTML = `<button type="button" class="authControl authControl-disabled" disabled>Sign in unavailable</button>`;
    console.warn("Auth is not configured. Missing CREDITCOMBO_CONFIG values.");
    return;
  }

  const session = await getSession();
  if (session?.access_token) {
    buildSignedInUi(mountEl, session);
  } else {
    buildSignedOutUi(mountEl);
  }

  onAuthStateChange((_, nextSession) => {
    if (nextSession?.access_token) {
      buildSignedInUi(mountEl, nextSession);
    } else {
      buildSignedOutUi(mountEl);
    }
  });
}
