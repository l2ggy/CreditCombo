const ROOT_PATH_REWRITES = {
  "/quick-setup": "/quick-setup.html",


  "/favicon.ico": "/icons/favicon.ico",
  "/favicon-32x32.png": "/icons/favicon-32x32.png",
  "/apple-touch-icon.png": "/icons/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png": "/icons/apple-touch-icon.png",
  "/safari-pinned-tab.svg": "/icons/safari-pinned-tab.svg",
  "/site.webmanifest": "/icons/site.webmanifest",
  "/icon-192.png": "/icons/icon-192.png",
  "/icon-512.png": "/icons/icon-512.png",
};

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function parseBearerToken(authHeader) {
  if (typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token || null;
}

function supabaseOrigin(supabaseUrl) {
  if (!supabaseUrl) return "";
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return "";
  }
}

function buildContentSecurityPolicy(supabaseUrl) {
  const origin = supabaseOrigin(supabaseUrl);
  const connectSrc = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ];

  if (origin) connectSrc.push(origin);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://cdn.jsdelivr.net",
    "style-src 'self'",
    "img-src 'self' data: https://www.google-analytics.com",
    `connect-src ${connectSrc.join(" ")}`,
  ].join("; ");
}

function withSecurityHeaders(response, { headRequest = false, supabaseUrl = "" } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(supabaseUrl));

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function injectRuntimeConfig(html, env) {
  const configScript = `<script>window.CREDITCOMBO_CONFIG=window.CREDITCOMBO_CONFIG||{};window.CREDITCOMBO_CONFIG.SUPABASE_URL=${JSON.stringify(env.SUPABASE_URL || "")};window.CREDITCOMBO_CONFIG.SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY || "")};window.CREDITCOMBO_CONFIG.ENTITLEMENTS_API_ENABLED=true;</script>`;

  if (html.includes("</head>")) return html.replace("</head>", `${configScript}</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${configScript}</body>`);
  return `${html}${configScript}`;
}

async function maybeInjectHtmlConfig(response, env) {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const injectedHtml = injectRuntimeConfig(html, env);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");

  return new Response(injectedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizeEntitlements(entitlementRow) {
  if (!entitlementRow) {
    return {
      premium: false,
      premiumUntil: null,
      reason: "no_row",
    };
  }

  const premiumEnabled = entitlementRow.premium_enabled === true;
  const premiumUntil = entitlementRow.premium_until ? new Date(entitlementRow.premium_until) : null;

  if (!premiumEnabled) {
    return {
      premium: false,
      premiumUntil: premiumUntil && !Number.isNaN(premiumUntil.getTime()) ? premiumUntil.toISOString() : null,
      reason: "disabled",
    };
  }

  if (!premiumUntil || Number.isNaN(premiumUntil.getTime())) {
    return {
      premium: true,
      premiumUntil: null,
      reason: "enabled",
    };
  }

  const premiumIsActive = premiumUntil.getTime() > Date.now();
  return {
    premium: premiumIsActive,
    premiumUntil: premiumUntil.toISOString(),
    reason: premiumIsActive ? "enabled" : "expired",
  };
}

async function fetchSupabaseUser(accessToken, env) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function fetchUserEntitlements(userId, env) {
  const query = new URLSearchParams({
    select: "user_id,premium_enabled,premium_until",
    user_id: `eq.${userId}`,
    limit: "1",
  });

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/user_entitlements?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!response.ok) throw new Error(`entitlements_query_failed_${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function handleEntitlementsApi(request, env) {
  const accessToken = parseBearerToken(request.headers.get("Authorization"));
  if (!accessToken) {
    return jsonResponse(401, { error: "missing_bearer_token" });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: "supabase_env_not_configured" });
  }

  const user = await fetchSupabaseUser(accessToken, env);
  if (!user?.id) {
    return jsonResponse(401, { error: "invalid_token" });
  }

  const entitlementRow = await fetchUserEntitlements(user.id, env);
  const normalized = normalizeEntitlements(entitlementRow);

  return jsonResponse(200, {
    authenticated: true,
    userId: user.id,
    premium: normalized.premium,
    premiumUntil: normalized.premiumUntil,
    reason: normalized.reason,
  });
}

async function fetchStaticAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  return maybeInjectHtmlConfig(response, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/me/entitlements") {
      if (request.method !== "GET") {
        return withSecurityHeaders(jsonResponse(405, { error: "method_not_allowed" }), {
          headRequest: request.method === "HEAD",
          supabaseUrl: env.SUPABASE_URL,
        });
      }

      try {
        const response = await handleEntitlementsApi(request, env);
        return withSecurityHeaders(response, {
          headRequest: request.method === "HEAD",
          supabaseUrl: env.SUPABASE_URL,
        });
      } catch {
        return withSecurityHeaders(jsonResponse(500, { error: "entitlements_lookup_failed" }), {
          headRequest: request.method === "HEAD",
          supabaseUrl: env.SUPABASE_URL,
        });
      }
    }

    const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];

    if (rewrittenPath) {
      url.pathname = rewrittenPath;
      const rewrittenRequest = new Request(url.toString(), {
        method: "GET",
        headers: request.headers,
      });
      const assetResponse = await fetchStaticAsset(rewrittenRequest, env);
      return withSecurityHeaders(assetResponse, {
        headRequest: request.method === "HEAD",
        supabaseUrl: env.SUPABASE_URL,
      });
    }

    const assetResponse = await fetchStaticAsset(request, env);
    return withSecurityHeaders(assetResponse, {
      headRequest: request.method === "HEAD",
      supabaseUrl: env.SUPABASE_URL,
    });
  },
};
