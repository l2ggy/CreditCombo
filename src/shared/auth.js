const AUTH_CONFIG_WARNING = "CreditCombo auth config is missing. Sign-in controls are disabled.";
const AUTH_MOUNT_ID = "creditcombo-auth-control";

let supabaseClient = null;
let warnedMissingConfig = false;

function getRuntimeConfig() {
  return window.CREDITCOMBO_CONFIG || {};
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const { SUPABASE_URL: supabaseUrl, SUPABASE_PUBLISHABLE_KEY: publishableKey } = getRuntimeConfig();
  const createClient = window.supabase?.createClient;

  if (!supabaseUrl || !publishableKey || typeof createClient !== "function") {
    if (!warnedMissingConfig) {
      console.warn(AUTH_CONFIG_WARNING);
      warnedMissingConfig = true;
    }
    return null;
  }

  supabaseClient = createClient(supabaseUrl, publishableKey);
  return supabaseClient;
}

export async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) return { error: new Error("Auth is not configured.") };
  return client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href
    }
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
  const { data } = await client.auth.getSession();
  return data?.session ?? null;
}

export function onAuthStateChange(callback) {
  const client = getSupabaseClient();
  if (!client) return { data: { subscription: { unsubscribe() {} } } };
  return client.auth.onAuthStateChange((_event, session) => callback(session ?? null));
}

function renderSignedOut(contentEl) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "authButton subtle";
  button.textContent = "Sign in";
  button.addEventListener("click", async () => {
    const { error } = await signInWithGoogle();
    if (error) console.warn("Sign-in failed", error);
  });
  contentEl.replaceChildren(button);
}

function renderSignedIn(contentEl, session) {
  const email = session?.user?.email || "Signed in";
  const avatarUrl = session?.user?.user_metadata?.avatar_url;

  const wrapper = document.createElement("div");
  wrapper.className = "authSignedIn";

  if (avatarUrl) {
    const avatar = document.createElement("img");
    avatar.className = "authAvatar";
    avatar.src = avatarUrl;
    avatar.alt = "Profile";
    wrapper.append(avatar);
  }

  const emailEl = document.createElement("span");
  emailEl.className = "authEmail";
  emailEl.textContent = email;

  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.className = "authButton";
  signOutBtn.textContent = "Sign out";
  signOutBtn.addEventListener("click", async () => {
    const { error } = await signOut();
    if (error) console.warn("Sign-out failed", error);
  });

  wrapper.append(emailEl, signOutBtn);
  contentEl.replaceChildren(wrapper);
}

export async function initAuthUi({ mountEl }) {
  if (!(mountEl instanceof HTMLElement)) return;

  let root = mountEl.querySelector(`#${AUTH_MOUNT_ID}`);
  if (!root) {
    root = document.createElement("div");
    root.id = AUTH_MOUNT_ID;
    root.className = "authControl";
    mountEl.append(root);
  }

  const content = document.createElement("div");
  root.replaceChildren(content);

  const client = getSupabaseClient();
  if (!client) {
    const disabled = document.createElement("button");
    disabled.type = "button";
    disabled.className = "authButton subtle";
    disabled.textContent = "Sign in";
    disabled.disabled = true;
    disabled.title = "Sign-in is unavailable right now";
    content.replaceChildren(disabled);
    return;
  }

  const render = async () => {
    const session = await getSession();
    if (session) {
      renderSignedIn(content, session);
      return;
    }
    renderSignedOut(content);
  };

  await render();
  onAuthStateChange((session) => {
    if (session) {
      renderSignedIn(content, session);
      return;
    }
    renderSignedOut(content);
  });
}
