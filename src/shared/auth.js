let supabaseClientPromise = null;
let authUiMounted = false;

function readConfig() {
  const config = window.CREDITCOMBO_CONFIG || {};
  const supabaseUrl = typeof config.SUPABASE_URL === "string" ? config.SUPABASE_URL.trim() : "";
  const supabaseKey = typeof config.SUPABASE_PUBLISHABLE_KEY === "string" ? config.SUPABASE_PUBLISHABLE_KEY.trim() : "";
  return {
    supabaseUrl,
    supabaseKey,
    configured: Boolean(supabaseUrl && supabaseKey),
  };
}

async function getSupabaseClient() {
  const { supabaseUrl, supabaseKey, configured } = readConfig();
  if (!configured) return null;

  if (!supabaseClientPromise) {
    supabaseClientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm")
      .then(({ createClient }) => createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }))
      .catch((error) => {
        console.warn("CreditCombo auth: failed to load Supabase client", error);
        supabaseClientPromise = null;
        return null;
      });
  }

  return supabaseClientPromise;
}

export async function getSession() {
  const client = await getSupabaseClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
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
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });

  return () => {
    data?.subscription?.unsubscribe();
  };
}

function renderUnavailableAuthControl(mountEl) {
  mountEl.innerHTML = `<button type="button" class="authControl" disabled title="Sign in is currently unavailable">Sign in</button>`;
}

function userLabel(session) {
  const email = session?.user?.email;
  if (typeof email === "string" && email) return email;
  return "Signed in";
}

function avatarLetter(session) {
  const label = userLabel(session);
  return label.charAt(0).toUpperCase();
}

function renderAuthControl(mountEl, session) {
  if (!session) {
    mountEl.innerHTML = `<button type="button" class="authControl" data-auth-sign-in>Sign in</button>`;
    mountEl.querySelector("[data-auth-sign-in]")?.addEventListener("click", () => {
      signInWithGoogle();
    });
    return;
  }

  mountEl.innerHTML = `
    <div class="authSignedIn" title="${userLabel(session)}">
      <span class="authAvatar" aria-hidden="true">${avatarLetter(session)}</span>
      <span class="authLabel">${userLabel(session)}</span>
      <button type="button" class="authControl authControlSmall" data-auth-sign-out>Sign out</button>
    </div>
  `;

  mountEl.querySelector("[data-auth-sign-out]")?.addEventListener("click", () => {
    signOut();
  });
}

export async function initAuthUi({ mountEl }) {
  if (!(mountEl instanceof Element) || authUiMounted) return;
  authUiMounted = true;

  const { configured } = readConfig();
  if (!configured) {
    console.warn("CreditCombo auth: SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing");
    renderUnavailableAuthControl(mountEl);
    return;
  }

  const session = await getSession();
  renderAuthControl(mountEl, session);

  await onAuthStateChange((nextSession) => {
    renderAuthControl(mountEl, nextSession);
  });
}
