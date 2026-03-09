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

function parseBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const match = authorizationHeader.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || null;
}

function supabaseOriginFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function injectRuntimeConfig(html, env) {
  const config = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || "",
    ENTITLEMENTS_API_ENABLED: true,
  };

  const script = `<script>window.CREDITCOMBO_CONFIG=${JSON.stringify(config)};</script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${script}</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${script}</body>`);
  return `${html}${script}`;
}

async function maybeInjectHtmlConfig(response, env, { headRequest = false } = {}) {
  const contentType = response.headers.get("Content-Type") || "";
  if (headRequest || !contentType.includes("text/html")) return response;

  const html = await response.text();
  const injectedHtml = injectRuntimeConfig(html, env);
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");

  return new Response(injectedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleEntitlementsRequest(request, env) {
  const accessToken = parseBearerToken(request.headers.get("Authorization"));
  if (!accessToken) return jsonResponse(401, { error: "missing_or_invalid_bearer_token" });

  const supabaseUrl = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return jsonResponse(503, { error: "server_not_configured" });
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
    },
  });

  if (!authResponse.ok) return jsonResponse(401, { error: "invalid_token" });

  const authUser = await authResponse.json();
  const userId = authUser?.id;
  if (!userId) return jsonResponse(401, { error: "invalid_token" });

  const entitlementsUrl = new URL(`${supabaseUrl}/rest/v1/user_entitlements`);
  entitlementsUrl.searchParams.set("select", "user_id,premium_enabled,premium_until");
  entitlementsUrl.searchParams.set("user_id", `eq.${userId}`);
  entitlementsUrl.searchParams.set("limit", "1");

  const entitlementResponse = await fetch(entitlementsUrl.toString(), {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Accept: "application/json",
    },
  });

  if (!entitlementResponse.ok) return jsonResponse(502, { error: "entitlements_query_failed" });

  const rows = await entitlementResponse.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  const premiumUntil = row?.premium_until ?? null;
  const premiumEnabled = row?.premium_enabled === true;
  const premiumUntilDate = premiumUntil ? Date.parse(premiumUntil) : null;
  const premiumNotExpired = !premiumUntil || (Number.isFinite(premiumUntilDate) && premiumUntilDate > Date.now());

  let premium = false;
  let reason = "no_row";

  if (row) {
    if (!premiumEnabled) {
      reason = "disabled";
    } else if (!premiumNotExpired) {
      reason = "expired";
    } else {
      premium = true;
      reason = "enabled";
    }
  }

  return jsonResponse(200, {
    authenticated: true,
    userId,
    premium,
    premiumUntil,
    reason,
  });
}

function withSecurityHeaders(response, { headRequest = false, supabaseOrigin = null } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
      "style-src 'self'",
      "img-src 'self' data: https://www.google-analytics.com",
      [
        "connect-src",
        "'self'",
        "https://www.google-analytics.com",
        "https://region1.google-analytics.com",
        supabaseOrigin,
      ].filter(Boolean).join(" "),
    ].join("; "),
  );

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const supabaseOrigin = supabaseOriginFromUrl(env.SUPABASE_URL);

    if (url.pathname === "/api/me/entitlements") {
      if (request.method !== "GET") {
        return withSecurityHeaders(jsonResponse(405, { error: "method_not_allowed" }), { supabaseOrigin });
      }
      const response = await handleEntitlementsRequest(request, env);
      return withSecurityHeaders(response, { supabaseOrigin });
    }

    const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];

    if (rewrittenPath) {
      url.pathname = rewrittenPath;
      const assetRequest = new Request(url.toString(), {
        method: "GET",
        headers: request.headers,
      });
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      const wrappedResponse = await maybeInjectHtmlConfig(assetResponse, env, {
        headRequest: request.method === "HEAD",
      });
      return withSecurityHeaders(wrappedResponse, {
        headRequest: request.method === "HEAD",
        supabaseOrigin,
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const wrappedResponse = await maybeInjectHtmlConfig(assetResponse, env, {
      headRequest: request.method === "HEAD",
    });
    return withSecurityHeaders(wrappedResponse, {
      headRequest: request.method === "HEAD",
      supabaseOrigin,
    });
  },
};
