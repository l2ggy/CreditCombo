import { renderCardThumb } from "../shared/render.js";
import { buildShareCopy } from "./share-copy.js";

export function createShareOverlay() {
  const state = {
    best: null,
    valuationMode: "estimated",
    netAfterChexy: 0,
    shareUrl: window.location.href
  };

  const root = document.createElement("div");
  root.className = "shareOverlay";
  root.hidden = true;
  root.innerHTML = `
    <div class="shareOverlay__backdrop" data-share-close></div>
    <div class="shareOverlay__dialog" role="dialog" aria-modal="true" aria-label="Share your result">
      <button type="button" class="shareOverlay__close" aria-label="Close share panel" data-share-close>×</button>
      <div class="shareCard" id="shareCard">
        <p class="shareCard__kicker"></p>
        <h3 class="shareCard__headline"></h3>
        <p class="shareCard__heroLabel"></p>
        <p class="shareCard__heroValue"></p>
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
      <div class="shareOverlay__actions">
        <button type="button" class="primary" data-share-download>Download PNG</button>
      </div>
    </div>
  `;

  document.body.append(root);

  const cardEl = root.querySelector("#shareCard");
  const cardsEl = root.querySelector(".shareCard__cards");
  const qrEl = root.querySelector(".shareCard__qr");

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-share-close")) close();
  });

  root.querySelector("[data-share-download]")?.addEventListener("click", downloadPng);

  function open() {
    if (!state.best?.combo?.length) return;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
  }

  function close() {
    root.classList.remove("is-open");
    window.setTimeout(() => {
      if (!root.classList.contains("is-open")) root.hidden = true;
    }, 180);
  }

  function updateContext(context = {}) {
    state.best = context.best || null;
    state.valuationMode = context.valuationMode || "estimated";
    state.netAfterChexy = Number(context.netAfterChexy || 0);
    state.shareUrl = context.shareUrl || window.location.href;

    const copy = buildShareCopy({
      netValue: state.netAfterChexy,
      valuationMode: state.valuationMode,
      cardCount: state.best?.combo?.length || 0
    });

    cardEl.querySelector(".shareCard__kicker").textContent = copy.kicker;
    cardEl.querySelector(".shareCard__headline").textContent = copy.headline;
    cardEl.querySelector(".shareCard__heroLabel").textContent = copy.heroValueLabel;
    cardEl.querySelector(".shareCard__heroValue").textContent = copy.heroValue;
    cardEl.querySelector(".shareCard__support").textContent = copy.support;
    cardEl.querySelector(".shareCard__cta").textContent = copy.cta;
    cardEl.querySelector(".shareCard__url").textContent = copy.urlLabel;

    renderCards(state.best?.combo || []);
    setQrImage();
  }

  function renderCards(cards) {
    cardsEl.innerHTML = "";
    cards.slice(0, 5).forEach((card, index) => {
      const item = document.createElement("div");
      item.className = "shareCard__cardThumb";
      item.style.setProperty("--share-card-index", String(index));
      item.append(renderCardThumb(card, { className: "thumb thumb-lg thumb-contain", withFrame: false }));
      cardsEl.append(item);
    });
  }

  function setQrImage() {
    qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(state.shareUrl)}`;
    qrEl.referrerPolicy = "no-referrer";
    qrEl.crossOrigin = "anonymous";
  }

  async function downloadPng() {
    const canvas = await renderShareCanvas();
    const link = document.createElement("a");
    link.download = "creditcombo-share.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function renderShareCanvas() {
    const size = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#151d2f");
    gradient.addColorStop(1, "#21103d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const copy = buildShareCopy({ netValue: state.netAfterChexy, valuationMode: state.valuationMode, cardCount: state.best?.combo?.length || 0 });
    ctx.fillStyle = "rgba(199,146,255,0.95)";
    ctx.font = "700 34px Inter, system-ui, sans-serif";
    ctx.fillText(copy.kicker, 100, 140);
    ctx.fillStyle = "#f3f7ff";
    ctx.font = "700 62px Inter, system-ui, sans-serif";
    ctx.fillText(copy.headline, 100, 220);
    ctx.fillStyle = "rgba(218,225,240,0.9)";
    ctx.font = "600 34px Inter, system-ui, sans-serif";
    ctx.fillText(copy.heroValueLabel, 100, 300);
    ctx.fillStyle = "#c792ff";
    ctx.font = "800 118px Inter, system-ui, sans-serif";
    ctx.fillText(copy.heroValue, 100, 410);

    await drawCardsCanvas(ctx, state.best?.combo || []);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 46px Inter, system-ui, sans-serif";
    ctx.fillText(copy.cta, 100, 1030);
    ctx.fillStyle = "rgba(214,221,233,0.92)";
    ctx.font = "500 34px Inter, system-ui, sans-serif";
    ctx.fillText(copy.urlLabel, 100, 1085);

    try {
      const qr = await loadImage(qrEl.src);
      ctx.fillStyle = "#fff";
      ctx.fillRect(930, 910, 180, 180);
      ctx.drawImage(qr, 945, 925, 150, 150);
    } catch {
      ctx.fillStyle = "#fff";
      ctx.fillRect(930, 910, 180, 180);
      ctx.fillStyle = "#111";
      ctx.fillRect(960, 940, 120, 120);
    }

    return canvas;
  }

  async function drawCardsCanvas(ctx, cards) {
    const layout = [
      { x: 130, y: 500 },
      { x: 380, y: 500 },
      { x: 630, y: 500 },
      { x: 255, y: 670 },
      { x: 505, y: 670 }
    ];

    for (const [index, card] of cards.slice(0, 5).entries()) {
      const image = await loadImage(`./assets/cards/${card.id}.webp`);
      const slot = layout[index];
      if (!slot) continue;
      ctx.save();
      const isPortrait = image.naturalHeight > image.naturalWidth;
      const cardWidth = 220;
      const cardHeight = 140;
      const shadowY = slot.y + 14;
      ctx.fillStyle = "rgba(6,10,24,0.38)";
      ctx.fillRect(slot.x + 8, shadowY, cardWidth, cardHeight);
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

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  return { open, close, updateContext };
}
