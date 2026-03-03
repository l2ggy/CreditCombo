import { renderCardThumb } from "../shared/render.js";
import { buildShareCopy } from "./share-copy.js";

export function createShareOverlay() {
  const state = {
    best: null,
    valuationMode: "estimated",
    netAfterChexy: 0,
    shareUrl: window.location.href,
    isDirty: true,
    renderPromise: null,
    lastPngBlob: null
  };

  const root = document.createElement("div");
  root.className = "shareOverlay";
  root.hidden = true;
  root.innerHTML = `
    <div class="shareOverlay__backdrop" data-share-close></div>
    <div class="shareOverlay__dialog" role="dialog" aria-modal="true" aria-label="Share your result">
      <div class="shareOverlay__header panelHeader">
        <h3>Share your result</h3>
        <button type="button" class="btn-inline shareOverlay__close" aria-label="Close share panel" data-share-close>Close</button>
      </div>

      <div class="shareCard" id="shareCard">
        <div class="shareCard__loading hidden" aria-live="polite">
          <span class="loadingSpinner" aria-hidden="true"></span>
          Preparing your share card…
        </div>
        <p class="shareCard__kicker"></p>
        <h4 class="shareCard__headline"></h4>
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
        <button type="button" class="btn-inline" data-share-native>Share…</button>
        <button type="button" class="primary btn-inline" data-share-download>Download PNG</button>
      </div>
    </div>
  `;

  document.body.append(root);

  const cardEl = root.querySelector("#shareCard");
  const loadingEl = root.querySelector(".shareCard__loading");
  const cardsEl = root.querySelector(".shareCard__cards");
  const qrEl = root.querySelector(".shareCard__qr");
  const downloadBtn = root.querySelector("[data-share-download]");
  const nativeShareBtn = root.querySelector("[data-share-native]");

  if (!("share" in navigator)) nativeShareBtn?.classList.add("hidden");

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-share-close")) close();
  });

  downloadBtn?.addEventListener("click", downloadPng);
  nativeShareBtn?.addEventListener("click", shareNative);

  function open() {
    if (!state.best?.combo?.length) return;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
    prepareCardView();
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
    state.isDirty = true;
    state.lastPngBlob = null;
  }

  async function prepareCardView() {
    if (!state.isDirty) return;
    if (state.renderPromise) {
      await state.renderPromise;
      return;
    }

    setPreparing(true);
    state.renderPromise = (async () => {
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
      await setQrImage();
      state.isDirty = false;
    })();

    try {
      await state.renderPromise;
    } finally {
      state.renderPromise = null;
      setPreparing(false);
    }
  }

  function setPreparing(isPreparing) {
    loadingEl?.classList.toggle("hidden", !isPreparing);
    cardEl?.classList.toggle("is-preparing", isPreparing);
    if (downloadBtn) downloadBtn.disabled = isPreparing;
    if (nativeShareBtn) nativeShareBtn.disabled = isPreparing;
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
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(state.shareUrl)}`;
    qrEl.src = qrSrc;
    qrEl.referrerPolicy = "no-referrer";
    qrEl.crossOrigin = "anonymous";

    await Promise.race([
      qrEl.decode?.() || Promise.resolve(),
      new Promise((resolve) => window.setTimeout(resolve, 900))
    ]).catch(() => null);
  }

  async function shareNative() {
    if (!("share" in navigator)) return;
    await prepareCardView();

    const copy = buildShareCopy({ netValue: state.netAfterChexy, valuationMode: state.valuationMode, cardCount: state.best?.combo?.length || 0 });
    const payload = {
      title: "CreditCombo result",
      text: `${copy.headline} ${copy.heroValue} in annual value.`,
      url: state.shareUrl
    };

    try {
      if (navigator.canShare) {
        const blob = state.lastPngBlob || await renderShareBlob();
        state.lastPngBlob = blob;
        const file = new File([blob], "creditcombo-share.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ ...payload, files: [file] });
          return;
        }
      }
      await navigator.share(payload);
    } catch {
      // user dismissed share sheet
    }
  }

  async function downloadPng() {
    await prepareCardView();
    const blob = state.lastPngBlob || await renderShareBlob();
    state.lastPngBlob = blob;
    const link = document.createElement("a");
    link.download = "creditcombo-share.png";
    link.href = URL.createObjectURL(blob);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function renderShareBlob() {
    const size = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const styles = getComputedStyle(document.documentElement);
    const panelColor = styles.getPropertyValue("--color-panel").trim() || "#101826";
    const accentColor = styles.getPropertyValue("--color-accent").trim() || "#6aa9ff";
    const highlightColor = styles.getPropertyValue("--color-brand-highlight").trim() || "#c792ff";

    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, panelColor);
    gradient.addColorStop(1, highlightColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const copy = buildShareCopy({ netValue: state.netAfterChexy, valuationMode: state.valuationMode, cardCount: state.best?.combo?.length || 0 });
    ctx.fillStyle = "rgba(243,247,255,0.95)";
    ctx.font = "700 30px Inter, system-ui, sans-serif";
    ctx.fillText(copy.kicker, 96, 126);
    ctx.fillStyle = "#f8fbff";
    ctx.font = "700 66px Inter, system-ui, sans-serif";
    ctx.fillText(copy.headline, 96, 214);
    ctx.fillStyle = "rgba(218,225,240,0.95)";
    ctx.font = "600 32px Inter, system-ui, sans-serif";
    ctx.fillText(copy.heroValueLabel, 96, 282);
    ctx.fillStyle = highlightColor;
    ctx.font = "800 118px Inter, system-ui, sans-serif";
    ctx.fillText(copy.heroValue, 96, 398);
    ctx.fillStyle = "rgba(236,242,252,0.92)";
    ctx.font = "500 34px Inter, system-ui, sans-serif";
    ctx.fillText(copy.support, 96, 456);

    await drawCardsCanvas(ctx, state.best?.combo || []);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 48px Inter, system-ui, sans-serif";
    ctx.fillText(copy.cta, 96, 1030);
    ctx.fillStyle = accentColor;
    ctx.font = "600 34px Inter, system-ui, sans-serif";
    ctx.fillText(copy.urlLabel, 96, 1085);

    try {
      const qr = await loadImage(qrEl.src);
      ctx.fillStyle = "#fff";
      ctx.fillRect(910, 888, 214, 214);
      ctx.drawImage(qr, 930, 908, 174, 174);
    } catch {
      ctx.fillStyle = "#fff";
      ctx.fillRect(910, 888, 214, 214);
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not render share image"));
      }, "image/png", 1);
    });
  }

  async function drawCardsCanvas(ctx, cards) {
    const layout = [
      { x: 126, y: 500 },
      { x: 370, y: 500 },
      { x: 614, y: 500 },
      { x: 248, y: 668 },
      { x: 492, y: 668 }
    ];

    for (const [index, card] of cards.slice(0, 5).entries()) {
      const image = await loadImage(`./assets/cards/${card.id}.webp`);
      const slot = layout[index];
      if (!slot) continue;
      ctx.save();
      const isPortrait = image.naturalHeight > image.naturalWidth;
      const cardWidth = 224;
      const cardHeight = 142;
      ctx.fillStyle = "rgba(7,11,24,0.35)";
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
