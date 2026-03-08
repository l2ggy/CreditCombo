const SUPABASE_SCRIPT_GLOBAL = "supabase";

let supabaseClient = null;
let authSetupAttempted = false;

function readPublicConfig() {
  const config = window.CREDITCOMBO_CONFIG || {};
  return {
    supabaseUrl: typeof config.SUPABASE_URL === "string" ? config.SUPABASE_URL.trim() : "",
    supabaseKey: typeof config.SUPABASE_PUBLISHABLE_KEY === "string" ? config.SUPABASE_PUBLISHABLE_KEY.trim() : "",
  };
}

function warnMissingConfig() {
  console.warn("Auth is unavailable because public Supabase config is missing.");
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (authSetupAttempted) return null;
  authSetupAttempted = true;

  const { supabaseUrl, supabaseKey } = readPublicConfig();
  if (!supabaseUrl || !supabaseKey) {
    warnMissingConfig();
    return null;
  }

  const api = window[SUPABASE_SCRIPT_GLOBAL];
  if (!api?.createClient) {
    console.warn("Auth is unavailable because Supabase client library was not loaded.");
    return null;
  }

  supabaseClient = api.createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

function getMountElement(mountEl) {
  if (mountEl instanceof Element) return mountEl;
  return null;
}

function renderDisabledUi(mountEl, label = "Sign in unavailable") {
  mountEl.innerHTML = `<button type="button" class="authAction" disabled>${label}</button>`;
}

function renderSignedOutUi(mountEl, { disabled = false } = {}) {
  mountEl.innerHTML = `<button type="button" class="authAction" ${disabled ? "disabled" : ""}>Sign in with Google</button>`;
}

function renderSignedInUi(mountEl, session) {
  const user = session?.user;
  const email = user?.email || "Signed in";
  const avatarUrl = user?.user_metadata?.avatar_url || "";

  mountEl.textContent = "";

  const userWrap = document.createElement("span");
  userWrap.className = "authUser";

  if (avatarUrl) {
    const avatar = document.createElement("img");
    avatar.className = "authAvatar";
    avatar.src = avatarUrl;
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.referrerPolicy = "no-referrer";
    userWrap.append(avatar);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "authAvatar authAvatarFallback";
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = "●";
    userWrap.append(fallback);
  }

  const emailEl = document.createElement("span");
  emailEl.className = "authEmail";
  emailEl.title = email;
  emailEl.textContent = email;
  userWrap.append(emailEl);

  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.className = "authSignOut";
  signOutBtn.textContent = "Sign out";

  mountEl.append(userWrap, signOutBtn);
}

export async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) return { error: new Error("Supabase is not configured") };

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
    console.warn("Unable to read auth session.", error);
    return null;
  }

  return data?.session || null;
}

export function onAuthStateChange(handler) {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    handler(session || null);
  });

  return () => {
    data?.subscription?.unsubscribe();
  };
}

export async function initAuthUi({ mountEl }) {
  const mount = getMountElement(mountEl);
  if (!mount) return;

  const client = getSupabaseClient();
  if (!client) {
    renderDisabledUi(mount);
    return;
  }

  renderSignedOutUi(mount);

  const refresh = async () => {
    const session = await getSession();
    if (session) {
      renderSignedInUi(mount, session);
      mount.querySelector(".authSignOut")?.addEventListener("click", async () => {
        await signOut();
      });
      return;
    }

    renderSignedOutUi(mount);
    mount.querySelector(".authAction")?.addEventListener("click", async () => {
      const { error } = await signInWithGoogle();
      if (error) console.warn("Google sign-in failed.", error);
    });
  };

  await refresh();
  return onAuthStateChange(() => {
    refresh();
  });
}
