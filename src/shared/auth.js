const AUTH_MOUNT_SELECTOR = "[data-auth-mount]";
const AUTH_REDIRECT_KEY = "creditcombo_auth_redirect";

let supabaseClientPromise = null;

function getConfig() {
  return window.CREDITCOMBO_CONFIG || null;
}

function normalizeRedirectPath(pathname) {
  return pathname || "/";
}

async function getSupabaseClient() {
  if (supabaseClientPromise) return supabaseClientPromise;

  const config = getConfig();
  if (!config?.SUPABASE_URL || !config?.SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  supabaseClientPromise = import("https://esm.sh/@supabase/supabase-js@2")
    .then(({ createClient }) => createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY));

  return supabaseClientPromise;
}

function renderUnavailableState(target) {
  target.innerHTML = "";
  const unavailable = document.createElement("span");
  unavailable.className = "subtle";
  unavailable.textContent = "Sign in unavailable";
  target.append(unavailable);
}

function renderAuthState(target, { user, onSignIn, onSignOut }) {
  target.innerHTML = "";

  if (user) {
    const userLabel = document.createElement("span");
    userLabel.className = "subtle";
    userLabel.textContent = user.email || "Signed in";

    const signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.className = "textLink authAction";
    signOutButton.textContent = "Sign out";
    signOutButton.addEventListener("click", onSignOut);

    target.append(userLabel, signOutButton);
    return;
  }

  const signInButton = document.createElement("button");
  signInButton.type = "button";
  signInButton.className = "textLink authAction";
  signInButton.textContent = "Sign in";
  signInButton.addEventListener("click", onSignIn);
  target.append(signInButton);
}

export async function getSession() {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session || null;
}

export async function onAuthStateChange(callback) {
  const client = await getSupabaseClient();
  if (!client) return { data: { subscription: { unsubscribe() {} } } };
  return client.auth.onAuthStateChange((_event, session) => callback(session || null));
}

export async function signInWithGoogle() {
  const client = await getSupabaseClient();
  if (!client) return;

  const redirectPath = normalizeRedirectPath(window.location.pathname + window.location.search + window.location.hash);
  sessionStorage.setItem(AUTH_REDIRECT_KEY, redirectPath);

  await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });
}

export async function signOut() {
  const client = await getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function initAuthUi() {
  const mount = document.querySelector(AUTH_MOUNT_SELECTOR);
  if (!mount) return;

  const client = await getSupabaseClient();
  if (!client) {
    console.warn("Auth config missing; sign-in is disabled.");
    renderUnavailableState(mount);
    return;
  }

  const redirectPath = sessionStorage.getItem(AUTH_REDIRECT_KEY);
  if (redirectPath && redirectPath !== normalizeRedirectPath(window.location.pathname + window.location.search + window.location.hash)) {
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    window.history.replaceState(null, "", redirectPath);
  }

  const render = async () => {
    const session = await getSession();
    renderAuthState(mount, {
      user: session?.user || null,
      onSignIn: signInWithGoogle,
      onSignOut: signOut,
    });
  };

  await render();
  await onAuthStateChange(render);
}
