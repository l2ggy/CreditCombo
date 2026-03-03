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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function inlineImages(root) {
  const images = [...root.querySelectorAll("img")];
  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("data:")) continue;
    try {
      const response = await fetch(src, { mode: "cors" });
      if (!response.ok) continue;
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      img.setAttribute("src", dataUrl);
    } catch {
      // Ignore image inline failures and keep original source.
    }
  }
}

function copyComputedStyles(source, target) {
  const sourceStyle = window.getComputedStyle(source);
  const style = [...sourceStyle]
    .map((prop) => `${prop}:${sourceStyle.getPropertyValue(prop)};`)
    .join("");
  target.setAttribute("style", style);

  const sourceChildren = [...source.children];
  const targetChildren = [...target.children];
  for (let index = 0; index < sourceChildren.length; index += 1) {
    if (targetChildren[index]) copyComputedStyles(sourceChildren[index], targetChildren[index]);
  }
}

async function downloadCardImage(cardEl) {
  if (!(cardEl instanceof HTMLElement)) return;

  const clone = cardEl.cloneNode(true);
  copyComputedStyles(cardEl, clone);
  await inlineImages(clone);

  const width = Math.ceil(cardEl.getBoundingClientRect().width);
  const height = Math.ceil(cardEl.getBoundingClientRect().height);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">${serialized}</foreignObject>
    </svg>
  `;

  const image = new Image();
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  const ready = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
  image.src = objectUrl;

  try {
    await ready;
    const scale = Math.max(2, Math.min(4, window.devicePixelRatio || 2));
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "creditcombo-share-card.png";
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
    const cards = (config.best?.combo || []).slice(0, 3);

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
          <h2>${copy.headline}</h2>
          <p>${copy.subheadline}</p>
          <label class="shareToggle"><input type="checkbox" ${privacyMode === "earn_rate_only" ? "checked" : ""}/> Hide personal spend details</label>
        </header>
        <article class="shareCard">
          <p class="shareHeroLabel">${copy.heroLabel}</p>
          <p class="shareHeroValue">${copy.heroValue}</p>
          <p class="shareSupport">${copy.supportLine}</p>
          <div class="shareThumbStack"></div>
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

      const stack = body.querySelector(".shareThumbStack");
      cards.forEach((card, index) => {
        const thumb = document.createElement("span");
        thumb.className = "shareThumbItem";
        thumb.style.setProperty("--share-index", String(index));
        thumb.append(renderCardThumb(card, { className: "thumb thumb-md thumb-contain", withFrame: false }));
        stack.append(thumb);
      });

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
        await downloadCardImage(body.querySelector(".shareCard"));
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
