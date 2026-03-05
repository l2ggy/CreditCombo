import { renderCardThumb } from "../shared/render.js";
import { buildShareCopy } from "./share-copy.js";

const QR_ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=";

export function createShareOverlay() {
  const root = document.createElement("div");
  root.className = "shareOverlay hidden";
  root.setAttribute("aria-hidden", "true");

  root.innerHTML = `
    <div class="shareOverlay__backdrop" data-share-close></div>
    <section class="shareOverlay__dialog" role="dialog" aria-modal="true" aria-label="Share optimization result" tabindex="-1">
      <header class="shareOverlay__header">
        <h2>Share result</h2>
        <button type="button" class="btn-inline shareOverlay__close" data-share-close aria-label="Close share dialog">Close</button>
      </header>
      <div class="shareOverlay__body">
        <article class="shareCard">
          <div class="shareCard__summary">
            <p class="shareCard__kicker"></p>
            <h3 class="shareCard__headline"></h3>
            <p class="shareCard__heroValue"></p>
            <p class="shareCard__heroLabel"></p>
            <p class="shareCard__support"></p>
          </div>
          <div class="shareCard__thumbs" data-layout="row-1"></div>
          <footer class="shareCard__footer">
            <div class="shareCard__footerText">
              <p class="shareCard__cta"></p>
              <p class="shareCard__urlRow"><span class="shareCard__urlLabel"></span></p>
            </div>
            <img class="shareCard__qr" alt="QR code to open this result" />
          </footer>
        </article>
      </div>
      <div class="shareOverlay__actions">
        <button type="button" class="primary" data-share-native>Share</button>
        <button type="button" data-share-download>Download image</button>
      </div>
    </section>
  `;

  document.body.append(root);

  const dialog = root.querySelector(".shareOverlay__dialog");
  const shareCard = root.querySelector(".shareCard");
  const kickerEl = root.querySelector(".shareCard__kicker");
  const headlineEl = root.querySelector(".shareCard__headline");
  const heroValueEl = root.querySelector(".shareCard__heroValue");
  const heroLabelEl = root.querySelector(".shareCard__heroLabel");
  const supportEl = root.querySelector(".shareCard__support");
  const thumbsEl = root.querySelector(".shareCard__thumbs");
  const ctaEl = root.querySelector(".shareCard__cta");
  const urlLabelEl = root.querySelector(".shareCard__urlLabel");
  const qrEl = root.querySelector(".shareCard__qr");
  const nativeBtn = root.querySelector("[data-share-native]");
  const downloadBtn = root.querySelector("[data-share-download]");

  const canUseNativeShare = window.isSecureContext && typeof navigator.share === "function";
  nativeBtn.classList.toggle("hidden", !canUseNativeShare);

  let context = null;
  let cachedBlob = null;
  let cachedKey = null;
  let previousOverflow = "";
  const orientationCache = new Map();

  function getShareCopy() {
    if (!context) return null;
    return buildShareCopy({
      netValue: context.netAfterChexy,
      valuationMode: context.valuationMode,
      cardCount: context.best?.combo?.length || 0,
      siteHost: getHostLabel(context.shareUrl)
    });
  }

  function contextKey(value) {
    if (!value?.best) return "";
    const comboIds = (value.best.combo || []).map((card) => card.id).join(",");
    return [comboIds, value.valuationMode, Number(value.netAfterChexy || 0).toFixed(2), value.shareUrl || ""].join("|");
  }

  async function applyContext() {
    if (!context?.best) return;
    const copy = getShareCopy();

    kickerEl.textContent = copy.kicker;
    headlineEl.textContent = copy.headline;
    heroValueEl.textContent = copy.heroValue;
    heroLabelEl.textContent = copy.heroValueLabel;
    supportEl.textContent = copy.support;
    supportEl.classList.toggle("hidden", !copy.support);
    ctaEl.textContent = copy.cta;
    urlLabelEl.textContent = copy.urlLabel;

    await renderThumbRows(context.best.combo || []);

    const shareUrl = context.shareUrl || window.location.href;
    qrEl.crossOrigin = "anonymous";
    qrEl.referrerPolicy = "no-referrer";
    qrEl.src = `${QR_ENDPOINT}${encodeURIComponent(shareUrl)}`;
  }

  async function renderThumbRows(cards) {
    thumbsEl.innerHTML = "";
    const capped = cards.slice(0, 5);
    const cardsWithOrientation = await Promise.all(capped.map(async (card) => ({
      card,
      isPortrait: await isPortraitCard(card, orientationCache)
    })));
    const sorted = cardsWithOrientation
      .sort((a, b) => Number(a.isPortrait) - Number(b.isPortrait));
    const layout = sorted.length === 5
      ? "rows-3-2"
      : sorted.length === 4
        ? "rows-2-2"
        : `row-${Math.max(1, sorted.length)}`;
    thumbsEl.dataset.layout = layout;

    const { landscapeSize, portraitSize } = thumbSizesForCount(sorted.length, window.innerWidth);
    thumbsEl.style.setProperty("--share-thumb-landscape", `${landscapeSize}px`);
    thumbsEl.style.setProperty("--share-thumb-portrait", `${portraitSize}px`);

    const rows = sorted.length === 5
      ? [sorted.slice(0, 3), sorted.slice(3, 5)]
      : sorted.length === 4
        ? [sorted.slice(0, 2), sorted.slice(2, 4)]
        : [sorted];
    rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "shareCard__thumbRow";
      row.forEach(({ card, isPortrait }) => {
        const thumbWrap = document.createElement("span");
        thumbWrap.className = `shareCard__thumb${isPortrait ? " shareCard__thumb--portrait" : ""}`;
        thumbWrap.append(renderCardThumb(card, { className: "thumb thumb-contain", withFrame: false }));
        rowEl.append(thumbWrap);
      });
      thumbsEl.append(rowEl);
    });
  }

  function open() {
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.focus();
  }

  function close() {
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    document.body.style.overflow = previousOverflow;
  }

  function updateContext(nextContext) {
    context = nextContext || null;
    const nextKey = contextKey(context);
    if (nextKey !== cachedKey) {
      cachedBlob = null;
      cachedKey = nextKey;
    }
    void applyContext();
  }

  async function withBusyState(button, label, action) {
    const nativeLabel = nativeBtn.textContent;
    const downloadLabel = downloadBtn.textContent;
    nativeBtn.disabled = true;
    downloadBtn.disabled = true;
    button.textContent = label;

    try {
      await action();
    } finally {
      nativeBtn.disabled = false;
      downloadBtn.disabled = false;
      nativeBtn.textContent = nativeLabel;
      downloadBtn.textContent = downloadLabel;
    }
  }

  async function getPngBlob() {
    if (cachedBlob) return cachedBlob;
    const blob = await elementToPngBlob(shareCard);
    cachedBlob = blob;
    return blob;
  }

  nativeBtn.addEventListener("click", async () => {
    if (!canUseNativeShare || !context) return;

    await withBusyState(nativeBtn, "Sharing…", async () => {
      const copy = getShareCopy();
      const payload = {
        title: "CreditCombo result",
        text: copy?.nativeShareText || "CreditCombo result",
        url: context.shareUrl
      };

      try {
        const blob = await getPngBlob();
        const file = new File([blob], "creditcombo-share.png", { type: "image/png" });
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          payload.files = [file];
        }
      } catch {
        // fall back to text/url only
      }

      await navigator.share(payload);
    });
  });

  downloadBtn.addEventListener("click", async () => {
    if (!context) return;

    await withBusyState(downloadBtn, "Preparing PNG…", async () => {
      try {
        const blob = await getPngBlob();
        downloadBlob(blob, "creditcombo-share.png");
      } catch (error) {
        console.error("Share image download failed", error);
      }
    });
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("[data-share-close]")) return;
    close();
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    close();
  });

  return { open, close, updateContext };
}



function thumbSizesForCount(count, viewportWidth = window.innerWidth) {
  const safeCount = Math.max(1, Number(count) || 1);
  const base = safeCount === 1
    ? { landscapeSize: 188, portraitSize: 188 }
    : safeCount === 2
      ? { landscapeSize: 132, portraitSize: 132 }
      : safeCount === 3
        ? { landscapeSize: 100, portraitSize: 100 }
        : safeCount === 4
          ? { landscapeSize: 108, portraitSize: 108 }
          : { landscapeSize: 96, portraitSize: 96 };

  if (viewportWidth > 720) return base;

  const mobileSizes = safeCount === 1
    ? { landscapeSize: 94, portraitSize: 94 }
    : safeCount === 2
      ? { landscapeSize: 82, portraitSize: 82 }
      : safeCount === 3
        ? { landscapeSize: 70, portraitSize: 70 }
        : safeCount === 4
          ? { landscapeSize: 56, portraitSize: 56 }
          : { landscapeSize: 52, portraitSize: 52 };

  return mobileSizes;
}

async function isPortraitCard(card, cache) {
  if (!card?.id) return false;
  if (cache.has(card.id)) return cache.get(card.id);

  const src = `./assets/cards/${card.id}.webp`;
  const isPortrait = await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalHeight > image.naturalWidth);
    image.onerror = () => resolve(false);
    image.src = src;
  });

  cache.set(card.id, isPortrait);
  return isPortrait;
}

function getHostLabel(url) {
  try {
    return new URL(url || window.location.href).host;
  } catch {
    return "creditcombo.ca";
  }
}

async function elementToPngBlob(element) {
  await waitForAssets(element);

  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));

  const clone = element.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  inlineComputedStyles(element, clone);
  await inlineImageSources(element, clone);

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;

  try {
    return await renderSvgToPngBlob(svg, width, height, { useObjectUrl: true });
  } catch (objectUrlError) {
    try {
      return await renderSvgToPngBlob(svg, width, height, { useObjectUrl: false });
    } catch {
      throw objectUrlError;
    }
  }
}

async function renderSvgToPngBlob(svgMarkup, width, height, { useObjectUrl }) {
  const image = await loadImageSource(svgMarkup, useObjectUrl);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Failed to create PNG blob"));
    }, "image/png");
  });
}

async function loadImageSource(svgMarkup, useObjectUrl) {
  if (useObjectUrl) {
    const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      return await loadImage(svgUrl);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  return loadImage(svgDataUrl);
}

async function waitForAssets(element) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  const images = [...element.querySelectorAll("img")];
  await Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
}

function inlineComputedStyles(sourceNode, targetNode) {
  if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) return;

  const sourceChildren = [...sourceNode.children];
  const targetChildren = [...targetNode.children];
  applyComputedStyle(sourceNode, targetNode);

  for (let idx = 0; idx < sourceChildren.length; idx += 1) {
    inlineComputedStyles(sourceChildren[idx], targetChildren[idx]);
  }
}

function applyComputedStyle(source, target) {
  const computed = window.getComputedStyle(source);
  const cssText = Array.from(computed).map((prop) => `${prop}:${computed.getPropertyValue(prop)};`).join("");
  target.setAttribute("style", cssText);
}

async function inlineImageSources(sourceRoot, targetRoot) {
  const sourceImages = [...sourceRoot.querySelectorAll("img")];
  const targetImages = [...targetRoot.querySelectorAll("img")];

  await Promise.all(sourceImages.map(async (sourceImage, idx) => {
    const targetImage = targetImages[idx];
    if (!targetImage) return;

    const src = sourceImage.currentSrc || sourceImage.src;
    if (!src) return;

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error("bad image response");
      const blob = await response.blob();
      targetImage.src = await blobToDataUrl(blob);
    } catch {
      targetImage.removeAttribute("src");
    }
  }));
}


function downloadBlob(blob, filename) {
  if (navigator.msSaveOrOpenBlob) {
    navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1000);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load SVG image"));
    image.src = src;
  });
}
