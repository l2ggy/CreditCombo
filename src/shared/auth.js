const AUTH_CONFIG_WARNING = "[auth] Supabase runtime config missing; auth controls will stay hidden.";

let supabaseClientPromise;
let missingConfigWarned = false;
let importFailureWarned = false;

function readRuntimeConfig() {
  const candidateConfigs = [
    globalThis?.CREDITCOMBO_RUNTIME_CONFIG,
    globalThis?.__CREDITCOMBO_RUNTIME_CONFIG__,
    globalThis?.RUNTIME_CONFIG,
    globalThis?.__RUNTIME_CONFIG__,
    globalThis?.APP_CONFIG
  ];

  for (const candidate of candidateConfigs) {
    if (candidate && typeof candidate === "object") return candidate;
  }

  return {};
}

function resolveSupabaseConfig() {
  const runtimeConfig = readRuntimeConfig();
  const supabaseUrl = runtimeConfig.SUPABASE_URL;
  const supabasePublishableKey = runtimeConfig.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    if (!missingConfigWarned) {
      missingConfigWarned = true;
      console.warn(AUTH_CONFIG_WARNING);
    }
    return null;
  }

  return {
    supabaseUrl,
    supabasePublishableKey
  };
}

async function createSupabaseClient() {
  const config = resolveSupabaseConfig();
  if (!config) return null;

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    return createClient(config.supabaseUrl, config.supabasePublishableKey);
  } catch (error) {
    if (!importFailureWarned) {
      importFailureWarned = true;
      console.warn("[auth] Failed to load Supabase client; auth controls disabled.", error);
    }
    return null;
  }
}

async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = createSupabaseClient();
  }
  return supabaseClientPromise;
}

function initialsForSession(session) {
  const name = String(
    session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email
    || ""
  ).trim();

  if (!name) return "?";

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function labelForSession(session) {
  const name = String(session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || "").trim();
  if (name) return name.split(/\s+/)[0];

  const email = String(session?.user?.email || "");
  if (!email.includes("@")) return "Account";
  return email.split("@")[0] || "Account";
}

export async function signInWithGoogle() {
  const supabase = await getSupabaseClient();
  if (!supabase) return { data: null, error: null };

  const redirectTo = window.location.href;
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  if (!supabase) return { error: null };
  return supabase.auth.signOut();
}

export async function getSession() {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("[auth] Failed to read session.", error);
    return null;
  }

  return data?.session ?? null;
}

export function onAuthStateChange(callback) {
  const subscribe = async () => {
    const supabase = await getSupabaseClient();
    if (!supabase) return null;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return data?.subscription ?? null;
  };

  const subscriptionPromise = subscribe();

  return {
    unsubscribe() {
      subscriptionPromise.then((subscription) => subscription?.unsubscribe()).catch(() => {});
    }
  };
}

export function initAuthUi(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    return { refresh: async () => null, destroy: () => {} };
  }

  container.classList.add("authSlot", "hidden");

  const root = document.createElement("div");
  root.className = "authWidget";
  container.replaceChildren(root);

  const hideAuthSlot = () => {
    container.classList.add("hidden");
    root.replaceChildren();
  };

  const renderSignedOut = () => {
    root.innerHTML = "";

    const signInButton = document.createElement("button");
    signInButton.type = "button";
    signInButton.className = "authInlineBtn";
    signInButton.textContent = options.signedOutLabel || "Sign in";
    signInButton.addEventListener("click", async () => {
      await signInWithGoogle();
    });

    root.append(signInButton);
    container.classList.remove("hidden");
  };

  const renderSignedIn = (session) => {
    root.innerHTML = "";

    const details = document.createElement("details");
    details.className = "authMenu";

    const summary = document.createElement("summary");
    summary.className = "authMenuTrigger";

    const avatar = document.createElement("span");
    avatar.className = "authAvatar";
    avatar.textContent = initialsForSession(session);

    const label = document.createElement("span");
    label.className = "authLabel";
    label.textContent = labelForSession(session);

    summary.append(avatar, label);

    const menu = document.createElement("div");
    menu.className = "authMenuPanel";

    const signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.className = "authMenuItem";
    signOutButton.textContent = "Sign out";
    signOutButton.addEventListener("click", async () => {
      await signOut();
      details.open = false;
    });

    menu.append(signOutButton);
    details.append(summary, menu);
    root.append(details);
    container.classList.remove("hidden");
  };

  const refresh = async () => {
    const config = resolveSupabaseConfig();
    if (!config) {
      hideAuthSlot();
      return null;
    }

    const session = await getSession();
    if (session) {
      renderSignedIn(session);
      return session;
    }

    renderSignedOut();
    return null;
  };

  refresh();

  return {
    refresh,
    destroy() {
      root.replaceChildren();
      container.classList.add("hidden");
    }
  };
}
