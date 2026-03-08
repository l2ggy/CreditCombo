let supabaseClientPromise = null;

function getConfig() {
  return window.CREDITCOMBO_CONFIG || {};
}

function hasAuthConfig(config) {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY);
}

async function getSupabaseClient() {
  if (supabaseClientPromise) return supabaseClientPromise;

  supabaseClientPromise = (async () => {
    const config = getConfig();
    if (!hasAuthConfig(config)) return null;

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    return createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  })();

  return supabaseClientPromise;
}

export async function signInWithGoogle() {
  const client = await getSupabaseClient();
  if (!client) return { error: new Error("Missing Supabase auth config") };
  return client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href,
    },
  });
}

export async function signOut() {
  const client = await getSupabaseClient();
  if (!client) return { error: new Error("Missing Supabase auth config") };
  return client.auth.signOut();
}

export async function getSession() {
  const client = await getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getSession();
  if (error) {
    console.warn("CreditCombo auth session lookup failed", error);
    return null;
  }

  return data?.session || null;
}

export async function onAuthStateChange(handler) {
  const client = await getSupabaseClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    handler(session || null);
  });

  return () => data?.subscription?.unsubscribe?.();
}

function initialsForUser(user) {
  const email = String(user?.email || "").trim();
  if (!email) return "?";
  return email.slice(0, 1).toUpperCase();
}

function setSignedOutUi(mountEl, disabled) {
  mountEl.innerHTML = "";

  const signInBtn = document.createElement("button");
  signInBtn.type = "button";
  signInBtn.className = "authSignInBtn";
  signInBtn.textContent = "Sign in with Google";
  signInBtn.disabled = Boolean(disabled);

  if (!disabled) {
    signInBtn.addEventListener("click", async () => {
      const { error } = await signInWithGoogle();
      if (error) console.warn("CreditCombo Google sign-in failed", error);
    });
  }

  mountEl.append(signInBtn);
}

function setSignedInUi(mountEl, session) {
  mountEl.innerHTML = "";
  const user = session?.user || {};

  const wrap = document.createElement("div");
  wrap.className = "authSignedIn";

  const avatar = document.createElement("span");
  avatar.className = "authAvatar";
  avatar.textContent = initialsForUser(user);
  avatar.setAttribute("aria-hidden", "true");

  const email = document.createElement("span");
  email.className = "authEmail";
  email.textContent = user.email || "Signed in";

  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.className = "authSignOutBtn";
  signOutBtn.textContent = "Sign out";
  signOutBtn.addEventListener("click", async () => {
    const { error } = await signOut();
    if (error) console.warn("CreditCombo sign-out failed", error);
  });

  wrap.append(avatar, email, signOutBtn);
  mountEl.append(wrap);
}

export async function initAuthUi({ mountEl }) {
  if (!mountEl) return;

  mountEl.classList.add("authControls");

  const config = getConfig();
  if (!hasAuthConfig(config)) {
    console.warn("CreditCombo auth disabled: missing public Supabase config");
    setSignedOutUi(mountEl, true);
    return;
  }

  const renderSession = (session) => {
    if (session?.user) {
      setSignedInUi(mountEl, session);
      return;
    }

    setSignedOutUi(mountEl, false);
  };

  renderSession(await getSession());
  await onAuthStateChange(renderSession);
}
