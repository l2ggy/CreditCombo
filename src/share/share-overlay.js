import { renderCardThumb } from "../shared/render.js";
import { buildShareCopy } from "./share-copy.js";

const MAX_SHARE_CARDS = 5;
const PNG_SIZE = 1200;

export function createShareOverlay() {
  const state = {
    best: null,
    valuationMode: "estimated",
    netAfterChexy: 0,
    shareUrl: window.location.href,
    siteHost: window.location.host,
    qrSrc: "",
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

  const cardEl = root.querySelector("#shareCard");
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
    cardEl.querySelector(".shareCard__kicker").textContent = copy.kicker;
    cardEl.querySelector(".shareCard__headline").textContent = copy.headline;
    cardEl.querySelector(".shareCard__heroValue").textContent = copy.heroValue;
    cardEl.querySelector(".shareCard__heroLabel").textContent = copy.heroValueLabel;
    cardEl.querySelector(".shareCard__support").textContent = copy.support;
    cardEl.querySelector(".shareCard__cta").textContent = copy.cta;
    cardEl.querySelector(".shareCard__url").textContent = copy.urlLabel;

    const cards = (state.best?.combo || []).slice(0, MAX_SHARE_CARDS);
    renderCards(cards);
    setQrImage();
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

  function setQrImage() {
    state.qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(state.shareUrl)}`;
    qrEl.src = state.qrSrc;
    qrEl.referrerPolicy = "no-referrer";
    qrEl.crossOrigin = "anonymous";
  }

  async function nativeShare() {
    if (!(navigator.share && window.isSecureContext)) return;
    prepareCard();

    setBusy(true, "Preparing share");
    try {
      const copy = currentCopy();
      const blob = await getPngBlob();
      const file = new File([blob], "creditcombo-share.png", { type: "image/png" });
      const shareData = { title: "CreditCombo result", text: copy.nativeShareText, url: state.shareUrl };
      if (navigator.canShare?.({ files: [file] })) shareData.files = [file];
      await navigator.share(shareData);
    } catch {
      // cancelled or unsupported
    } finally {
      setBusy(false);
    }
  }

  async function downloadPng() {
    prepareCard();
    setBusy(true, "Rendering");
    try {
      const blob = await getPngBlob();
      const link = document.createElement("a");
      link.download = "creditcombo-share.png";
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
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
    const canvas = await renderShareCanvas();
    state.pngBlob = await canvasToBlob(canvas);
    return state.pngBlob;
  }

  async function renderShareCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = PNG_SIZE;
    canvas.height = PNG_SIZE;
    const ctx = canvas.getContext("2d");
    const copy = currentCopy();
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

    await drawCardsCanvas(ctx, (state.best?.combo || []).slice(0, MAX_SHARE_CARDS));

    ctx.fillStyle = accent;
    ctx.font = "700 46px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(copy.cta, 90, 1020);
    ctx.fillStyle = muted;
    ctx.font = "500 34px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(copy.urlLabel, 90, 1070);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(920, 890, 206, 206);
    if (state.qrSrc) {
      try {
        const qr = await loadImage(state.qrSrc);
        ctx.drawImage(qr, 936, 906, 174, 174);
      } catch {
        // keep white container
      }
    }

    return canvas;
  }

  async function drawCardsCanvas(ctx, cards) {
    const layout = canvasCardLayout(cards.length);

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

function canvasCardLayout(count) {
  if (count === 5) return [{ x: 120, y: 470 }, { x: 365, y: 470 }, { x: 610, y: 470 }, { x: 242, y: 626 }, { x: 487, y: 626 }];
  if (count === 4) return [{ x: 72, y: 500 }, { x: 312, y: 500 }, { x: 552, y: 500 }, { x: 792, y: 500 }];
  if (count === 3) return [{ x: 192, y: 520 }, { x: 440, y: 520 }, { x: 688, y: 520 }];
  if (count === 2) return [{ x: 304, y: 540 }, { x: 560, y: 540 }];
  return [{ x: 430, y: 550 }];
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
  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16)
  };
}
