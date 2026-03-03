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

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return y;
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
  return cursorY;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function loadImage(src) {
  if (!src) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function downloadCardImage(cardEl) {
  if (!(cardEl instanceof HTMLElement)) throw new Error("Missing share card element");

  const width = 1200;
  const height = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create export canvas context");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1d4f9f");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const pad = 56;
  drawRoundedRect(ctx, pad, pad, width - (pad * 2), height - (pad * 2), 28);
  ctx.fillStyle = "rgba(15,23,42,0.35)";
  ctx.fill();

  const heroLabel = cardEl.querySelector(".shareHeroLabel")?.textContent || "";
  const heroValue = cardEl.querySelector(".shareHeroValue")?.textContent || "";
  const support = cardEl.querySelector(".shareSupport")?.textContent || "";
  const cta = cardEl.querySelector(".shareCta")?.textContent || "";
  const link = cardEl.querySelector(".shareCardFooter a")?.textContent || "";

  let cursorY = 140;
  const startX = 96;
  const textWidth = 820;

  ctx.fillStyle = "#bfdbfe";
  ctx.font = "600 36px Inter, system-ui, sans-serif";
  cursorY = wrapText(ctx, heroLabel, startX, cursorY, textWidth, 44) + 28;

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 96px Inter, system-ui, sans-serif";
  cursorY = wrapText(ctx, heroValue, startX, cursorY, textWidth, 106) + 24;

  ctx.fillStyle = "#dbeafe";
  ctx.font = "500 34px Inter, system-ui, sans-serif";
  cursorY = wrapText(ctx, support, startX, cursorY, textWidth, 46) + 50;

  const cardNodes = [...cardEl.querySelectorAll(".shareThumbItem img")];
  const cardImages = await Promise.all(cardNodes.map((img) => loadImage(img.getAttribute("src"))));
  const top = cardImages.slice(0, 3).filter(Boolean);
  const bottom = cardImages.slice(3, 5).filter(Boolean);

  const drawRow = (images, y, cardWidth = 230, overlap = 42) => {
    if (!images.length) return;
    const totalWidth = (images.length * cardWidth) - ((images.length - 1) * overlap);
    let x = (width - totalWidth) / 2;
    images.forEach((image) => {
      const ratio = image.naturalHeight / image.naturalWidth;
      const h = cardWidth * ratio;
      ctx.save();
      ctx.shadowColor = "rgba(2,6,23,0.35)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 12;
      ctx.drawImage(image, x, y, cardWidth, h);
      ctx.restore();
      x += cardWidth - overlap;
    });
  };

  drawRow(top, cursorY, 230, 42);
  if (bottom.length) drawRow(bottom, cursorY + 300, 250, 52);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 42px Inter, system-ui, sans-serif";
  ctx.fillText(cta, startX, 1020);

  ctx.fillStyle = "#bfdbfe";
  ctx.font = "500 28px Inter, system-ui, sans-serif";
  wrapText(ctx, link, startX, 1072, 720, 34);

  const qrSrc = cardEl.querySelector(".shareQr")?.getAttribute("src");
  const qr = await loadImage(qrSrc);
  if (qr) {
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, 966, 948, 170, 170, 12);
    ctx.fill();
    ctx.drawImage(qr, 976, 958, 150, 150);
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to create PNG blob");
  const objectUrl = URL.createObjectURL(blob);
  try {
    const linkEl = document.createElement("a");
    linkEl.href = objectUrl;
    linkEl.download = "creditcombo-share-card.png";
    linkEl.click();
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
          <h2>${copy.headline}</h2>
          <p>${copy.subheadline}</p>
          <label class="shareToggle"><input type="checkbox" ${privacyMode === "earn_rate_only" ? "checked" : ""}/> Hide personal spend details</label>
        </header>
        <article class="shareCard">
          <p class="shareHeroLabel">${copy.heroLabel}</p>
          <p class="shareHeroValue">${copy.heroValue}</p>
          <p class="shareSupport">${copy.supportLine}</p>
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
        thumb.append(renderCardThumb(card, { className: "thumb thumb-lg thumb-contain", withFrame: false }));
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
