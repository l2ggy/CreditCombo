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

async function downloadCardImage({ copy, payload, cards = [] }) {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#14254d");
  gradient.addColorStop(1, "#3b82f6");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 72px Inter, system-ui";
  ctx.fillText("CreditCombo", 90, 170);
  ctx.font = "bold 84px Inter, system-ui";
  ctx.fillText(copy.heroValue || "", 90, 380);
  ctx.font = "600 44px Inter, system-ui";
  ctx.fillText(copy.heroLabel || "", 90, 450);
  ctx.font = "500 40px Inter, system-ui";
  ctx.fillText(copy.supportLine || "", 90, 530);

  const thumbs = cards.slice(0, 3);
  for (let index = 0; index < thumbs.length; index += 1) {
    const card = thumbs[index];
    const img = await new Promise((resolve) => {
      const node = new Image();
      node.crossOrigin = "anonymous";
      node.onload = () => resolve(node);
      node.onerror = () => resolve(null);
      node.src = new URL(`./assets/cards/${card.id}.webp`, window.location.href).toString();
    });
    if (!img) continue;
    const x = 90 + (index * 230);
    const y = 700 + (index * 60);
    ctx.drawImage(img, x, y, 320, 200);
  }

  ctx.fillStyle = "#dbeafe";
  ctx.font = "600 42px Inter, system-ui";
  ctx.fillText(copy.ctaText || "Check your CreditCombo", 90, 1300);
  ctx.fillStyle = "#bfdbfe";
  ctx.font = "500 30px Inter, system-ui";
  ctx.fillText(payload.publicCtaUrl.replace(/^https?:\/\//, ""), 90, 1360);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "creditcombo-share-card.png";
  link.click();
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
        await downloadCardImage({ copy, payload, cards });
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
