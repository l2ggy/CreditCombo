import { renderCardThumb } from "../shared/render.js";
import { buildShareCopy } from "./share-copy.js";

const MAX_SHARE_CARDS = 5;
const PNG_SCALE = 2;
const PNG_SIZE = 1200;

export function createShareOverlay() {
  const state = {
    best: null,
    valuationMode: "estimated",
    netAfterChexy: 0,
    shareUrl: window.location.href,
    siteHost: window.location.host,
    prepared: false,
    pngBlob: null
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
    qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(state.shareUrl)}`;
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
      const blob = await getPngBlob();
      const shareData = { title: "CreditCombo result", text: copy.nativeShareText, url: state.shareUrl };
      if (blob) {
        const file = new File([blob], "creditcombo-share.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) shareData.files = [file];
      }
      await navigator.share(shareData);
    } catch {
      // user cancelled / unsupported target
    } finally {
      setBusy(false);
    }
  }

  async function downloadPng() {
    prepareCard();
    setBusy(true, "Rendering");
    try {
      const blob = await getPngBlob();
      if (!blob) return;
      const link = document.createElement("a");
      link.download = "creditcombo-share.png";
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      // failed to export in this environment
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

  async function getPngBlob() {
    if (state.pngBlob) return state.pngBlob;

    try {
      state.pngBlob = await elementToPngBlob(shareCardEl, PNG_SCALE);
    } catch {
      state.pngBlob = await fallbackCanvasBlob(currentCopy(), (state.best?.combo || []).slice(0, MAX_SHARE_CARDS), state.shareUrl);
    }

    return state.pngBlob;
  }

  return { open, close, updateContext };
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

async function elementToPngBlob(element, scale = 2) {
  const { width, height } = element.getBoundingClientRect();
  const clone = element.cloneNode(true);
  inlineComputedStyles(element, clone);
  await inlineImages(clone);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject>
    </svg>
  `;

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);
    return canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function inlineComputedStyles(sourceNode, targetNode) {
  if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) return;
  targetNode.setAttribute("style", getComputedStyle(sourceNode).cssText);

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
      const response = await fetch(src, { mode: "cors" });
      const blob = await response.blob();
      img.setAttribute("src", await blobToDataUrl(blob));
    } catch {
      // keep original src if fetch or conversion fails
    }
  }));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}


async function fallbackCanvasBlob(copy, cards, shareUrl) {
  const canvas = document.createElement("canvas");
  canvas.width = PNG_SIZE;
  canvas.height = PNG_SIZE;
  const ctx = canvas.getContext("2d");

  const theme = getComputedStyle(document.documentElement);
  const panel = theme.getPropertyValue("--color-panel").trim() || "#101826";
  const accent = theme.getPropertyValue("--color-accent").trim() || "#6aa9ff";
  const highlight = theme.getPropertyValue("--color-brand-highlight").trim() || "#c792ff";
  const text = theme.getPropertyValue("--color-text").trim() || "#e8eef7";
  const muted = theme.getPropertyValue("--color-muted").trim() || "#a9b4c2";

  const gradient = ctx.createLinearGradient(0, 0, PNG_SIZE, PNG_SIZE);
  gradient.addColorStop(0, mixColors(panel, "#02050d", 0.52));
  gradient.addColorStop(1, mixColors(panel, highlight, 0.24));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PNG_SIZE, PNG_SIZE);

  ctx.fillStyle = highlight;
  ctx.font = "700 32px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(copy.kicker, 90, 128);
  ctx.fillStyle = text;
  ctx.font = "800 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(copy.headline, 90, 210);
  ctx.fillStyle = highlight;
  ctx.font = "800 122px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(copy.heroValue, 90, 358);
  ctx.fillStyle = muted;
  ctx.font = "600 30px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(copy.heroValueLabel, 90, 410);

  await drawFallbackCards(ctx, cards);

  ctx.fillStyle = accent;
  ctx.font = "700 46px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(copy.cta, 90, 1020);
  ctx.fillStyle = muted;
  ctx.font = "500 34px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(copy.urlLabel, 90, 1070);

  ctx.fillStyle = "#fff";
  ctx.fillRect(920, 890, 206, 206);
  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(shareUrl)}`;
    const qr = await loadImage(qrUrl);
    ctx.drawImage(qr, 936, 906, 174, 174);
  } catch {
    // blank qr box
  }

  return canvasToBlob(canvas);
}

async function drawFallbackCards(ctx, cards) {
  const layout = cards.length === 5
    ? [{ x: 120, y: 470 }, { x: 365, y: 470 }, { x: 610, y: 470 }, { x: 242, y: 626 }, { x: 487, y: 626 }]
    : cards.length === 4
      ? [{ x: 72, y: 500 }, { x: 312, y: 500 }, { x: 552, y: 500 }, { x: 792, y: 500 }]
      : cards.length === 3
        ? [{ x: 192, y: 520 }, { x: 440, y: 520 }, { x: 688, y: 520 }]
        : cards.length === 2
          ? [{ x: 304, y: 540 }, { x: 560, y: 540 }]
          : [{ x: 430, y: 550 }];

  for (const [index, card] of cards.entries()) {
    const slot = layout[index];
    if (!slot) continue;
    const image = await loadImage(`./assets/cards/${card.id}.webp`);
    const isPortrait = image.naturalHeight > image.naturalWidth;
    const cardWidth = 220;
    const cardHeight = 140;

    ctx.save();
    ctx.fillStyle = "rgba(4,8,20,0.4)";
    ctx.fillRect(slot.x + 8, slot.y + 12, cardWidth, cardHeight);
    if (isPortrait) {
      ctx.translate(slot.x + cardWidth / 2, slot.y + cardHeight / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(image, -cardHeight / 2, -cardWidth / 2, cardHeight, cardWidth);
    } else {
      ctx.drawImage(image, slot.x, slot.y, cardWidth, cardHeight);
    }
    ctx.restore();
  }
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

function mixColors(hexA, hexB, ratio) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const blend = (x, y) => Math.round(x + (y - x) * ratio);
  return `rgb(${blend(a.r, b.r)} ${blend(a.g, b.g)} ${blend(a.b, b.b)})`;
}

function parseHex(hex) {
  const clean = String(hex).replace("#", "").trim();
  const normalized = clean.length === 3 ? clean.split("").map((v) => v + v).join("") : clean;
  const safe = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "101826";
  return { r: Number.parseInt(safe.slice(0, 2), 16), g: Number.parseInt(safe.slice(2, 4), 16), b: Number.parseInt(safe.slice(4, 6), 16) };
}
