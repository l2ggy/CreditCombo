import { renderCardThumb } from "../shared/render.js";
import { buildShareCopy } from "./share-copy.js";

const MAX_SHARE_CARDS = 5;
const PNG_SCALE = 2;

const EMPTY_PIXEL_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7pO8wAAAAASUVORK5CYII=";

export function createShareOverlay() {
  const state = {
    best: null,
    valuationMode: "estimated",
    netAfterChexy: 0,
    shareUrl: window.location.href,
    siteHost: window.location.host,
    prepared: false,
    pngBlob: null,
    pngPromise: null
  };

  const root = document.createElement("div");
  root.className = "shareOverlay";
  root.hidden = true;
  root.innerHTML = `
    <div class="shareOverlay__backdrop" data-share-close></div>
    <div class="shareOverlay__dialog panel" role="dialog" aria-modal="true" aria-label="Share your result">
      <div class="shareOverlay__header">
        <h3>Share your result</h3>
        <button type="button" class="btn-inline shareOverlay__close" aria-label="Close share panel" data-share-close>Close</button>
      </div>
      <div class="divider"></div>
      <div class="shareOverlay__body">
        <div class="shareCard" id="shareCard">
          <p class="shareCard__kicker"></p>
          <h4 class="shareCard__headline"></h4>
          <p class="shareCard__heroValue"></p>
          <p class="shareCard__heroLabel"></p>
          <p class="shareCard__support"></p>
          <div class="shareCard__cards" aria-label="Cards in this combo"></div>
          <div class="shareCard__footer">
            <div class="shareCard__footerText">
              <p class="shareCard__cta"></p>
              <p class="shareCard__url"></p>
            </div>
            <img class="shareCard__qr" alt="QR code for this optimizer result" />
          </div>
        </div>
      </div>
      <div class="shareOverlay__actions">
        <button type="button" class="btn-inline" data-share-native>Share…</button>
        <button type="button" class="primary btn-inline" data-share-download>Download PNG</button>
      </div>
    </div>
  `;

  document.body.append(root);

  const shareCardEl = root.querySelector("#shareCard");
  const cardsEl = root.querySelector(".shareCard__cards");
  const qrEl = root.querySelector(".shareCard__qr");
  const nativeBtn = root.querySelector("[data-share-native]");
  const downloadBtn = root.querySelector("[data-share-download]");

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.hasAttribute("data-share-close")) close();
  });

  downloadBtn?.addEventListener("click", downloadPng);
  nativeBtn?.addEventListener("click", nativeShare);
  if (!(navigator.share && window.isSecureContext)) nativeBtn?.classList.add("hidden");

  function open() {
    if (!state.best?.combo?.length) return;
    root.hidden = false;
    root.classList.add("is-open");
    setBodyScrollLock(true);
    prepareCard();
    warmupPng();
  }

  function close() {
    root.classList.remove("is-open");
    setBodyScrollLock(false);
    window.setTimeout(() => {
      if (!root.classList.contains("is-open")) root.hidden = true;
    }, 170);
  }

  function updateContext(context = {}) {
    state.best = context.best || null;
    state.valuationMode = context.valuationMode || "estimated";
    state.netAfterChexy = Number(context.netAfterChexy || 0);
    state.shareUrl = context.shareUrl || window.location.href;
    state.siteHost = parseHost(state.shareUrl);
    state.prepared = false;
    state.pngBlob = null;
    state.pngPromise = null;
  }

  function currentCopy() {
    return buildShareCopy({
      netValue: state.netAfterChexy,
      valuationMode: state.valuationMode,
      cardCount: state.best?.combo?.length || 0,
      siteHost: state.siteHost
    });
  }

  function prepareCard() {
    if (state.prepared) return;

    const copy = currentCopy();
    shareCardEl.querySelector(".shareCard__kicker").textContent = copy.kicker;
    shareCardEl.querySelector(".shareCard__headline").textContent = copy.headline;
    shareCardEl.querySelector(".shareCard__heroValue").textContent = copy.heroValue;
    shareCardEl.querySelector(".shareCard__heroLabel").textContent = copy.heroValueLabel;
    shareCardEl.querySelector(".shareCard__support").textContent = copy.support;
    shareCardEl.querySelector(".shareCard__cta").textContent = copy.cta;
    shareCardEl.querySelector(".shareCard__url").textContent = copy.urlLabel;

    renderCards((state.best?.combo || []).slice(0, MAX_SHARE_CARDS));
    qrEl.src = qrUrl(state.shareUrl);
    qrEl.referrerPolicy = "no-referrer";
    qrEl.crossOrigin = "anonymous";
    state.prepared = true;
  }

  function renderCards(cards) {
    cardsEl.innerHTML = "";
    cardsEl.dataset.layout = cardLayoutKey(cards.length);

    cards.forEach((card) => {
      const item = document.createElement("div");
      item.className = "shareCard__cardThumb";
      item.append(renderCardThumb(card, { className: "thumb thumb-lg thumb-contain", withFrame: false }));
      cardsEl.append(item);
    });
  }

  async function nativeShare() {
    if (!(navigator.share && window.isSecureContext)) return;
    prepareCard();
    setBusy(true, "Preparing share");

    try {
      const copy = currentCopy();
      const shareData = { title: "CreditCombo result", text: copy.nativeShareText, url: state.shareUrl };

      const readyBlob = state.pngBlob;
      if (readyBlob) {
        const file = new File([readyBlob], "creditcombo-share.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) shareData.files = [file];
      } else {
        warmupPng();
      }

      await navigator.share(shareData);
    } catch (error) {
      console.error("Share action failed", error);
    } finally {
      setBusy(false);
    }
  }

  async function downloadPng() {
    prepareCard();
    setBusy(true, "Rendering");

    try {
      const blob = await getPngBlob();
      if (!blob) throw new Error("PNG blob unavailable");
      triggerDownload(blob, "creditcombo-share.png");
    } catch (error) {
      console.error("PNG download failed, retrying PNG from serialized SVG", error);
      try {
        const svgBlob = await elementToSvgBlob(shareCardEl);
        const fallbackBlob = await rasterizeSvgBlobToPng(svgBlob, shareCardEl, PNG_SCALE);
        triggerDownload(fallbackBlob, "creditcombo-share.png");
      } catch (pngRetryError) {
        console.error("Download action failed", pngRetryError);
      }
    } finally {
      setBusy(false);
    }
  }

  function setBusy(isBusy, label = "Preparing") {
    if (downloadBtn) {
      downloadBtn.disabled = isBusy;
      downloadBtn.textContent = isBusy ? `${label}…` : "Download PNG";
    }
    if (nativeBtn && !nativeBtn.classList.contains("hidden")) {
      nativeBtn.disabled = isBusy;
      nativeBtn.textContent = isBusy ? "Working…" : "Share…";
    }
  }

  function warmupPng() {
    if (state.pngBlob || state.pngPromise) return;
    state.pngPromise = elementToPngBlob(shareCardEl, PNG_SCALE)
      .then((blob) => {
        state.pngBlob = blob;
        return blob;
      })
      .catch((error) => {
        state.pngPromise = null;
        throw error;
      });
  }

  async function getPngBlob() {
    if (state.pngBlob) return state.pngBlob;
    if (!state.pngPromise) warmupPng();
    state.pngBlob = await state.pngPromise;
    return state.pngBlob;
  }

  return { open, close, updateContext };
}

async function elementToPngBlob(element, scale = 2) {
  const { width, height } = element.getBoundingClientRect();
  if (!width || !height) throw new Error("Share card has no rendered size");

  const svgBlob = await elementToSvgBlob(element);
  const image = await loadImageFromSvgBlob(svgBlob);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0, width, height);
  return canvasToBlob(canvas);
}

async function elementToSvgBlob(element) {
  const { width, height } = element.getBoundingClientRect();
  if (!width || !height) throw new Error("Share card has no rendered size");

  await waitForElementImages(element);
  if (document.fonts?.ready) await document.fonts.ready;
  await nextFrame();

  const clone = element.cloneNode(true);
  inlineComputedStyles(element, clone);
  clone.style.margin = "0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = `${width}px`;
  await inlineImages(clone);

  const foreignObjectBody = `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;">${new XMLSerializer().serializeToString(clone)}</div>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${foreignObjectBody}</foreignObject></svg>`;
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

function inlineComputedStyles(sourceNode, targetNode) {
  if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) return;

  const computed = getComputedStyle(sourceNode);
  const styleText = computed.cssText || collectComputedStyleText(computed);
  targetNode.setAttribute("style", styleText);

  const sourceChildren = [...sourceNode.children];
  const targetChildren = [...targetNode.children];
  sourceChildren.forEach((sourceChild, index) => {
    inlineComputedStyles(sourceChild, targetChildren[index]);
  });
}

async function inlineImages(root) {
  const images = [...root.querySelectorAll("img")];
  await Promise.all(images.map(async (img) => {
    const src = img.getAttribute("src");
    if (!src) return;

    try {
      const response = await fetchWithTimeout(src, 3500, { mode: "cors" });
      if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
      const blob = await response.blob();
      img.setAttribute("src", await blobToDataUrl(blob));
      return;
    } catch {
      // fall through to raster fallback
    }

    const fallbackDataUrl = rasterizeImageDataUrl(img);
    img.setAttribute("src", fallbackDataUrl || EMPTY_PIXEL_DATA_URL);
  }));
}

async function waitForElementImages(root) {
  const images = [...root.querySelectorAll("img")];
  await Promise.all(images.map(async (img) => {
    if (!img.getAttribute("src")) return;

    img.loading = "eager";
    img.decoding = "sync";

    if (!img.currentSrc) {
      img.src = img.src;
    }

    if (!img.complete) {
      await Promise.race([
        new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        }),
        delay(1800)
      ]);
    }

    if (img.decode) {
      try {
        await Promise.race([img.decode(), delay(1200)]);
      } catch {
        // ignore decode failures and let exporter use current raster state
      }
    }
  }));
}


function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function collectComputedStyleText(style) {
  let text = "";
  for (let i = 0; i < style.length; i += 1) {
    const name = style.item(i);
    if (!name) continue;
    text += `${name}:${style.getPropertyValue(name)};`;
  }
  return text;
}

function rasterizeImageDataUrl(img) {
  try {
    const width = img.naturalWidth || img.width || 1;
    const height = img.naturalHeight || img.height || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function fetchWithTimeout(url, timeoutMs = 3000, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => window.clearTimeout(timer));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadImageFromSvgBlob(svgBlob) {
  const blobUrl = URL.createObjectURL(svgBlob);
  try {
    return await loadImage(blobUrl);
  } catch {
    const svgText = await svgBlob.text();
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    return loadImage(dataUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function rasterizeSvgBlobToPng(svgBlob, sourceElement, scale = 2) {
  const { width, height } = sourceElement.getBoundingClientRect();
  if (!width || !height) throw new Error("Share card has no rendered size");

  const image = await loadImageFromSvgBlob(svgBlob);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0, width, height);
  return canvasToBlob(canvas);
}

function triggerDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = objectUrl;
  link.rel = "noopener";
  document.body.append(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

function parseHost(url) {
  try {
    return new URL(url).host || window.location.host;
  } catch {
    return window.location.host;
  }
}

function cardLayoutKey(count) {
  if (count === 5) return "3-2";
  if (count >= 4) return "4-1";
  return `${Math.max(1, count)}-0`;
}

function qrUrl(shareUrl) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(shareUrl)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode PNG"));
    }, "image/png");
  });
}

function setBodyScrollLock(locked) {
  document.body.style.overflow = locked ? "hidden" : "";
}
