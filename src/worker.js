export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") {
      url.pathname = "/icons/favicon.ico";
      const faviconRequest = new Request(url.toString(), request);
      return env.ASSETS.fetch(faviconRequest);
    }

    return env.ASSETS.fetch(request);
  },
};
