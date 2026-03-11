const SUPABASE_ESM_URL = "https://esm.sh/@supabase/supabase-js@2";

let supabaseClientPromise = null;
let authSubscription = null;

function readRuntimeConfig() {
  return window.CREDITCOMBO_CONFIG || null;
}

async function getSupabaseClient() {
  if (supabaseClientPromise) return supabaseClientPromise;

  const config = readRuntimeConfig();
  if (!config?.SUPABASE_URL || !config?.SUPABASE_PUBLISHABLE_KEY) return null;

  supabaseClientPromise = import(SUPABASE_ESM_URL)
    .then(({ createClient }) => createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY))
    .catch((error) => {
      console.warn("Failed to initialize Supabase client", error);
      supabaseClientPromise = null;
      return null;
    });

  return supabaseClientPromise;
}

function renderDisabledAuthUi(mountEl, message = "Sign in unavailable") {
  mountEl.innerHTML = `<span class="authStatus authStatusMuted">${message}</span>`;
}

function renderSignedOutAuthUi(mountEl, { disabled = false } = {}) {
  mountEl.innerHTML = `<button type="button" class="authButton" data-auth-action="signin" ${disabled ? "disabled" : ""}>Sign in</button>`;
}

function renderSignedInAuthUi(mountEl, session) {
  const email = session?.user?.email;
  mountEl.innerHTML = `
    <span class="authStatus">${email ? `Signed in: ${email}` : "Signed in"}</span>
    <button type="button" class="authButton" data-auth-action="signout">Sign out</button>
  `;
}

export async function getSession() {
  const client = await getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getSession();
  if (error) {
    console.warn("Unable to retrieve auth session", error);
    return null;
  }

  return data?.session || null;
}

export async function signInWithGoogle() {
  const client = await getSupabaseClient();
  if (!client) return;

  await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href,
    },
  });
}

export async function signOut() {
  const client = await getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function onAuthStateChange(callback) {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return data?.subscription || null;
}

export async function initAuthUi() {
  const mountEl = document.querySelector("[data-auth-mount]");
  if (!mountEl) return;

  const config = readRuntimeConfig();
  if (!config?.SUPABASE_URL || !config?.SUPABASE_PUBLISHABLE_KEY || !config?.ENTITLEMENTS_API_ENABLED) {
    console.warn("Auth UI disabled: runtime config is missing required fields");
    renderDisabledAuthUi(mountEl);
    return;
  }

  renderSignedOutAuthUi(mountEl, { disabled: true });

  const client = await getSupabaseClient();
  if (!client) {
    renderDisabledAuthUi(mountEl);
    return;
  }

  const syncUiWithSession = async () => {
    const session = await getSession();
    if (session) {
      renderSignedInAuthUi(mountEl, session);
    } else {
      renderSignedOutAuthUi(mountEl);
    }
  };

  await syncUiWithSession();

  if (authSubscription?.unsubscribe) authSubscription.unsubscribe();
  authSubscription = await onAuthStateChange(() => {
    syncUiWithSession();
  });

  mountEl.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches("[data-auth-action='signin']")) {
      await signInWithGoogle();
      return;
    }

    if (target.matches("[data-auth-action='signout']")) {
      await signOut();
      await syncUiWithSession();
    }
  });
}
