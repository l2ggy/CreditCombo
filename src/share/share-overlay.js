import { renderCardThumb } from "../shared/render.js";
import { buildShareCopy } from "./share-copy.js";

export function createShareOverlay() {
  const state = {
    best: null,
    valuationMode: "estimated",
    netAfterChexy: 0,
    shareUrl: window.location.href,
    qrSrc: "",
    prepared: false,
    preparing: null,
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
      <div class="shareOverlay__status hidden" role="status" aria-live="polite">
        <span class="loadingSpinner" aria-hidden="true"></span>
        <span>Preparing…</span>
      </div>
      <div class="shareOverlay__body hidden">
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
      <div class="shareOverlay__actions hidden">
        <button type="button" class="btn-inline" data-share-native>Share…</button>
        <button type="button" class="primary btn-inline" data-share-download>Download PNG</button>
      </div>
    </div>
  `;

  document.body.append(root);

  const cardEl = root.querySelector("#shareCard");
  const cardsEl = root.querySelector(".shareCard__cards");
  const qrEl = root.querySelector(".shareCard__qr");
  const statusEl = root.querySelector(".shareOverlay__status");
  const bodyEl = root.querySelector(".shareOverlay__body");
  const actionsEl = root.querySelector(".shareOverlay__actions");
  const nativeBtn = root.querySelector("[data-share-native]");

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-share-close")) close();
  });

  root.querySelector("[data-share-download]")?.addEventListener("click", downloadPng);
  nativeBtn?.addEventListener("click", nativeShare);
  if (!(navigator.share && window.isSecureContext)) nativeBtn?.classList.add("hidden");

  async function open() {
    if (!state.best?.combo?.length) return;
    root.hidden = false;
    root.classList.add("is-open");
    setBodyScrollLock(true);
    showStatus();

    try {
      await prepare();
      showBody();
    } catch {
      showStatus("Couldn’t prepare your share card. Please try again.");
    }
  }

  function close() {
    root.classList.remove("is-open");
    setBodyScrollLock(false);
    window.setTimeout(() => {
      if (!root.classList.contains("is-open")) root.hidden = true;
    }, 170);
  }

  function showStatus(message = "Preparing…") {
    statusEl.classList.remove("hidden");
    statusEl.lastElementChild.textContent = message;
    bodyEl.classList.add("hidden");
    actionsEl.classList.add("hidden");
  }

  function showBody() {
    statusEl.classList.add("hidden");
    bodyEl.classList.remove("hidden");
    actionsEl.classList.remove("hidden");
  }

  function updateContext(context = {}) {
    state.best = context.best || null;
    state.valuationMode = context.valuationMode || "estimated";
    state.netAfterChexy = Number(context.netAfterChexy || 0);
    state.shareUrl = context.shareUrl || window.location.href;
    state.prepared = false;
    state.preparing = null;
    state.pngBlob = null;
  }

  async function prepare() {
    if (state.prepared) return;
    if (state.preparing) return state.preparing;

    state.preparing = (async () => {
      const copy = buildShareCopy({
        netValue: state.netAfterChexy,
        valuationMode: state.valuationMode,
        cardCount: state.best?.combo?.length || 0
      });

      cardEl.querySelector(".shareCard__kicker").textContent = copy.kicker;
      cardEl.querySelector(".shareCard__headline").textContent = copy.headline;
      cardEl.querySelector(".shareCard__heroValue").textContent = copy.heroValue;
      cardEl.querySelector(".shareCard__heroLabel").textContent = copy.heroValueLabel;
      cardEl.querySelector(".shareCard__support").textContent = copy.support;
      cardEl.querySelector(".shareCard__cta").textContent = copy.cta;
      cardEl.querySelector(".shareCard__url").textContent = copy.urlLabel;

      renderCards(state.best?.combo || []);
      await setQrImage();
      state.prepared = true;
    })();

    try {
      await state.preparing;
    } finally {
      state.preparing = null;
    }
  }

  function renderCards(cards) {
    cardsEl.innerHTML = "";
    cards.slice(0, 5).forEach((card) => {
      const item = document.createElement("div");
      item.className = "shareCard__cardThumb";
      item.append(renderCardThumb(card, { className: "thumb thumb-lg thumb-contain", withFrame: false }));
      cardsEl.append(item);
    });
  }

  async function setQrImage() {
    state.qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=6&data=${encodeURIComponent(state.shareUrl)}`;
    qrEl.src = state.qrSrc;
    qrEl.referrerPolicy = "no-referrer";
    qrEl.crossOrigin = "anonymous";

    try {
      await waitForImage(qrEl, 3500);
    } catch {
      qrEl.removeAttribute("src");
      state.qrSrc = "";
    }
  }

  async function nativeShare() {
    if (!(navigator.share && window.isSecureContext)) return;
    showStatus("Preparing share…");
    await prepare();

    const copy = buildShareCopy({
      netValue: state.netAfterChexy,
      valuationMode: state.valuationMode,
      cardCount: state.best?.combo?.length || 0
    });

    try {
      const blob = await getPngBlob();
      const file = new File([blob], "creditcombo-share.png", { type: "image/png" });
      const shareData = {
        title: "CreditCombo result",
        text: copy.nativeShareText,
        url: state.shareUrl
      };

      if (navigator.canShare?.({ files: [file] })) {
        shareData.files = [file];
      }

      await navigator.share(shareData);
    } catch {
      // user canceled or device does not support share target
    } finally {
      showBody();
    }
  }

  async function downloadPng() {
    showStatus("Rendering PNG…");
    await prepare();
    const blob = await getPngBlob();
    const link = document.createElement("a");
    link.download = "creditcombo-share.png";
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showBody();
  }

  async function getPngBlob() {
    if (state.pngBlob) return state.pngBlob;
    const canvas = await renderShareCanvas();
    state.pngBlob = await canvasToBlob(canvas);
    return state.pngBlob;
  }

  async function renderShareCanvas() {
    const size = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const theme = getComputedStyle(document.documentElement);
    const panel = theme.getPropertyValue("--color-panel").trim() || "#101826";
    const accent = theme.getPropertyValue("--color-accent").trim() || "#6aa9ff";
    const highlight = theme.getPropertyValue("--color-brand-highlight").trim() || "#c792ff";
    const text = theme.getPropertyValue("--color-text").trim() || "#e8eef7";
    const muted = theme.getPropertyValue("--color-muted").trim() || "#a9b4c2";

    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, mixColors(panel, "#02050d", 0.52));
    gradient.addColorStop(1, mixColors(panel, highlight, 0.24));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const copy = buildShareCopy({ netValue: state.netAfterChexy, valuationMode: state.valuationMode, cardCount: state.best?.combo?.length || 0 });
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

    await drawCardsCanvas(ctx, state.best?.combo || []);

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
        // keep blank QR container
      }
    }

    return canvas;
  }

  async function drawCardsCanvas(ctx, cards) {
    const layout = [
      { x: 120, y: 470 },
      { x: 366, y: 470 },
      { x: 612, y: 470 },
      { x: 245, y: 645 },
      { x: 490, y: 645 }
    ];

    for (const [index, card] of cards.slice(0, 5).entries()) {
      const image = await loadImage(`./assets/cards/${card.id}.webp`);
      const slot = layout[index];
      if (!slot) continue;
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function waitForImage(img, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Image load timed out"));
    }, timeoutMs);

    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed to load image"));
    };

    function cleanup() {
      window.clearTimeout(timeout);
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    }

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
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
