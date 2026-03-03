import { renderCardThumb } from "../shared/render.js";
import { buildShareCopy } from "./share-copy.js";
import { buildSharePayload } from "./share-payload.js";

function emitShareEvent(eventName, detail = {}) {
  const payload = { event: eventName, ...detail };
  window.dispatchEvent(new CustomEvent("creditcombo:telemetry", { detail: payload }));
  if (window.CreditComboTelemetry?.track) {
    window.CreditComboTelemetry.track(eventName, detail);
  }
}

function trapFocus(root, event) {
  if (event.key !== "Tab") return;
  const items = [...root.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function downloadCardImage(cardEl) {
  if (!(cardEl instanceof HTMLElement)) throw new Error("Missing share card element");

  const imageEls = [...cardEl.querySelectorAll("img")];
  imageEls.forEach((img) => {
    img.loading = "eager";
    img.decoding = "sync";
  });

  await Promise.all(imageEls.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      setTimeout(done, 1500);
    });
  }));

  const { toPng } = await import("https://esm.sh/html-to-image@1.11.11");
  const dataUrl = await toPng(cardEl, {
    cacheBust: true,
    pixelRatio: Math.max(2, window.devicePixelRatio || 1),
    backgroundColor: "#0f172a"
  });

  const linkEl = document.createElement("a");
  linkEl.href = dataUrl;
  linkEl.download = "creditcombo-share-card.png";
  linkEl.click();
}


export function createShareOverlay() {
  let active = null;
  let returnFocus = null;

  function close() {
    if (!active) return;
    active.remove();
    active = null;
    document.body.classList.remove("shareOpen");
    if (returnFocus) returnFocus.focus();
  }

  function open(config = {}) {
    close();
    let privacyMode = "full";
    returnFocus = document.activeElement;
    const cards = config.best?.combo || [];

    active = document.createElement("div");
    active.className = "shareOverlay";
    active.innerHTML = `
      <div class="shareOverlayBackdrop" data-share-close="1"></div>
      <section class="shareDialog" role="dialog" aria-modal="true" aria-label="Share your CreditCombo">
        <button type="button" class="shareClose" data-share-close="1" aria-label="Close share dialog">×</button>
        <div class="shareDialogBody"></div>
      </section>
    `;

    const body = active.querySelector(".shareDialogBody");
    const render = () => {
      const copy = buildShareCopy({ mode: config.mode, privacyMode, metrics: config.metrics });
      const payload = buildSharePayload({ mode: config.mode, deepLinkState: config.deepLinkState, copy });

      body.innerHTML = `
        <header class="shareHeader">
          <p class="shareKicker">${copy.kicker || "My CreditCombo"}</p>
          <h2>${copy.headline}</h2>
          <p>${copy.subheadline}</p>
          <p class="sharePunch">${copy.punchLine || "My ideal CreditCombo."}</p>
          <label class="shareToggle"><input type="checkbox" ${privacyMode === "earn_rate_only" ? "checked" : ""}/> Hide personal spend details</label>
        </header>
        <article class="shareCard">
          <p class="shareHeroLabel">${copy.heroLabel}</p>
          <p class="shareHeroValue">${copy.heroValue}</p>
          <p class="shareSupport">${copy.supportLine}</p>
          <p class="shareDetail">${copy.detailLine || ""}</p>
          <div class="shareThumbRows">
            <div class="shareThumbRow shareThumbRow--top"></div>
            <div class="shareThumbRow shareThumbRow--bottom"></div>
          </div>
          <footer class="shareCardFooter">
            <div>
              <p class="shareCta">${copy.ctaText}</p>
              <a href="${payload.publicCtaUrl}" target="_blank" rel="noopener noreferrer">${payload.publicCtaUrl}</a>
            </div>
            <img class="shareQr" src="${payload.qrImageUrl}" alt="QR code to quick setup"/>
          </footer>
        </article>
        <div class="shareActionsRow">
          <button type="button" class="primary" data-share-native>Share</button>
          <button type="button" data-share-copy>Copy link</button>
          <button type="button" data-share-download>Download image</button>
        </div>
      `;

      const topRow = body.querySelector(".shareThumbRow--top");
      const bottomRow = body.querySelector(".shareThumbRow--bottom");
      cards.forEach((card, index) => {
        const thumb = document.createElement("span");
        thumb.className = "shareThumbItem";
        thumb.style.setProperty("--share-index", String(index));
        const cardImg = renderCardThumb(card, { className: "thumb thumb-lg thumb-contain", withFrame: false });
        if (cardImg instanceof HTMLImageElement) {
          cardImg.loading = "eager";
          cardImg.decoding = "sync";
          cardImg.fetchPriority = "high";
        }
        thumb.append(cardImg);
        if (index < 3) topRow.append(thumb);
        else bottomRow.append(thumb);
      });
      bottomRow.classList.toggle("hidden", cards.length <= 3);

      body.querySelector(".shareToggle input")?.addEventListener("change", (event) => {
        privacyMode = event.target.checked ? "earn_rate_only" : "full";
        emitShareEvent("share_privacy_toggled", { page: config.page, mode: config.mode, privacy_mode: privacyMode });
        render();
      });

      body.querySelector("[data-share-copy]")?.addEventListener("click", async () => {
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload.publicCtaUrl);
          else window.prompt("Copy this link", payload.publicCtaUrl);
          emitShareEvent("share_link_copied", { page: config.page, mode: config.mode, privacy_mode: privacyMode });
        } catch {
          window.prompt("Copy this link", payload.publicCtaUrl);
        }
      });

      body.querySelector("[data-share-native]")?.addEventListener("click", async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title: payload.title, text: payload.text, url: payload.publicCtaUrl });
            emitShareEvent("share_native_sent", { page: config.page, mode: config.mode, privacy_mode: privacyMode });
            return;
          }
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload.publicCtaUrl);
          else window.prompt("Copy this link", payload.publicCtaUrl);
          emitShareEvent("share_link_copied", { page: config.page, mode: config.mode, privacy_mode: privacyMode });
        } catch {
          window.prompt("Copy this link", payload.publicCtaUrl);
        }
      });

      body.querySelector("[data-share-download]")?.addEventListener("click", async () => {
        const cardEl = body.querySelector(".shareCard");
        await downloadCardImage(cardEl);
        emitShareEvent("share_image_downloaded", { page: config.page, mode: config.mode, privacy_mode: privacyMode });
      });
    };

    render();

    active.addEventListener("click", (event) => {
      if (event.target.closest("[data-share-close]")) close();
    });

    active.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      trapFocus(active, event);
    });

    document.body.append(active);
    document.body.classList.add("shareOpen");
    active.querySelector(".shareClose")?.focus();
    emitShareEvent("share_opened", { page: config.page, mode: config.mode, privacy_mode: privacyMode });
  }

  return { open, close };
}
