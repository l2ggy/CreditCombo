const ROOT_ICON_REWRITES = {
  "/favicon.ico": "/icons/favicon.ico",
  "/apple-touch-icon.png": "/icons/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png": "/icons/apple-touch-icon.png",
};

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const rewrittenPath = ROOT_ICON_REWRITES[url.pathname];

    if (rewrittenPath) {
      url.pathname = rewrittenPath;
      return env.ASSETS.fetch(new Request(url.toString(), request));
    }

    return env.ASSETS.fetch(request);
  },
};
