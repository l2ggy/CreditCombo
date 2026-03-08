const AUTH_STORAGE_KEY = "creditcombo.supabase.session";
const authListeners = new Set();
let authClient = null;
let pendingHashRead = false;

function readConfig() {
  const config = window.CREDITCOMBO_CONFIG || {};
  const supabaseUrl = typeof config.SUPABASE_URL === "string" ? config.SUPABASE_URL.trim() : "";
  const supabasePublishableKey = typeof config.SUPABASE_PUBLISHABLE_KEY === "string"
    ? config.SUPABASE_PUBLISHABLE_KEY.trim()
    : "";

  return {
    supabaseUrl,
    supabasePublishableKey,
    hasConfig: Boolean(supabaseUrl && supabasePublishableKey),
  };
}

function loadStoredSession() {
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (!session) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function emitAuthStateChange(event, session) {
  authListeners.forEach((listener) => {
    try {
      listener(event, session);
    } catch (error) {
      console.error("Auth state handler failed", error);
    }
  });
}

function sanitizeSession(rawSession) {
  if (!rawSession || typeof rawSession !== "object") return null;

  const accessToken = typeof rawSession.access_token === "string" ? rawSession.access_token : "";
  if (!accessToken) return null;

  return {
    access_token: accessToken,
    refresh_token: typeof rawSession.refresh_token === "string" ? rawSession.refresh_token : "",
    expires_at: Number(rawSession.expires_at) || null,
    token_type: typeof rawSession.token_type === "string" ? rawSession.token_type : "bearer",
    user: typeof rawSession.user === "object" && rawSession.user ? rawSession.user : null,
  };
}

async function fetchCurrentUser(client) {
  if (!client.session?.access_token) return client.session;

  const response = await fetch(`${client.config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: client.config.supabasePublishableKey,
      Authorization: `Bearer ${client.session.access_token}`,
    },
  });

  if (!response.ok) return client.session;

  const user = await response.json();
  client.session = {
    ...client.session,
    user,
  };
  saveSession(client.session);
  return client.session;
}

function parseAuthHash() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const tokenType = params.get("token_type");
  if (!accessToken || !tokenType) return null;

  const session = sanitizeSession({
    access_token: accessToken,
    refresh_token: params.get("refresh_token"),
    token_type: tokenType,
    expires_at: params.get("expires_at"),
  });

  if (session) {
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, "", cleanUrl);
  }

  return session;
}

function ensureClient() {
  if (authClient) return authClient;

  const config = readConfig();
  authClient = {
    config,
    session: sanitizeSession(loadStoredSession()),
  };

  if (!config.hasConfig) {
    console.warn("Supabase auth config is missing. Auth controls are disabled.");
  }

  if (!pendingHashRead) {
    pendingHashRead = true;
    const hashSession = parseAuthHash();
    if (hashSession) {
      authClient.session = hashSession;
      saveSession(hashSession);
      emitAuthStateChange("SIGNED_IN", hashSession);
      fetchCurrentUser(authClient)
        .then((sessionWithUser) => emitAuthStateChange("TOKEN_REFRESHED", sessionWithUser))
        .catch(() => {});
    }
  }

  return authClient;
}

export async function signInWithGoogle() {
  const client = ensureClient();
  if (!client.config.hasConfig) return;

  const authUrl = new URL(`${client.config.supabaseUrl}/auth/v1/authorize`);
  authUrl.searchParams.set("provider", "google");
  authUrl.searchParams.set("redirect_to", window.location.href);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("flow_type", "implicit");

  window.location.assign(authUrl.toString());
}

export async function signOut() {
  const client = ensureClient();
  const activeSession = client.session;

  client.session = null;
  saveSession(null);
  emitAuthStateChange("SIGNED_OUT", null);

  if (!client.config.hasConfig || !activeSession?.access_token) return;

  try {
    await fetch(`${client.config.supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: client.config.supabasePublishableKey,
        Authorization: `Bearer ${activeSession.access_token}`,
      },
    });
  } catch {
    // Best-effort server logout; local session is already cleared.
  }
}

export async function getSession() {
  const client = ensureClient();
  if (client.session?.access_token && !client.session.user) {
    try {
      await fetchCurrentUser(client);
    } catch {
      // Keep existing session if profile fetch fails.
    }
  }
  return client.session;
}

export function onAuthStateChange(handler) {
  authListeners.add(handler);
  return {
    unsubscribe() {
      authListeners.delete(handler);
    }
  };
}

function createDisabledUi(container) {
  container.innerHTML = '<button class="authButton" type="button" disabled>Sign in unavailable</button>';
}

function emailOrFallback(user) {
  if (typeof user?.email === "string" && user.email.trim()) return user.email;
  return "Signed in";
}

function avatarInitial(user) {
  const source = user?.email || user?.user_metadata?.full_name || "U";
  return String(source).trim().charAt(0).toUpperCase() || "U";
}

function renderAuthUi(container, session, { disabled = false } = {}) {
  if (disabled) {
    createDisabledUi(container);
    return;
  }

  if (!session) {
    container.innerHTML = '<button class="authButton" type="button" data-auth-sign-in>Sign in with Google</button>';
    const signInButton = container.querySelector("[data-auth-sign-in]");
    signInButton?.addEventListener("click", () => {
      signInWithGoogle();
    });
    return;
  }

  container.innerHTML = `
    <div class="authSignedIn" aria-live="polite">
      <span class="authAvatar" aria-hidden="true">${avatarInitial(session.user)}</span>
      <span class="authIdentity">${emailOrFallback(session.user)}</span>
      <button class="authSignOut" type="button" data-auth-sign-out>Sign out</button>
    </div>
  `;

  container.querySelector("[data-auth-sign-out]")?.addEventListener("click", () => {
    signOut();
  });
}

export async function initAuthUi({ mountEl }) {
  const client = ensureClient();
  if (!mountEl) return;

  renderAuthUi(mountEl, client.session, { disabled: !client.config.hasConfig });

  if (client.config.hasConfig) {
    const session = await getSession();
    renderAuthUi(mountEl, session);
  }

  onAuthStateChange((_event, session) => {
    renderAuthUi(mountEl, session, { disabled: !client.config.hasConfig });
  });
}
