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
          </div>
          <div class="shareCard__thumbs"></div>
          <footer class="shareCard__footer">
            <div class="shareCard__footerText">
              <p class="shareCard__cta"></p>
              <p class="shareCard__urlRow"><a class="shareCard__urlLink" target="_blank" rel="noopener noreferrer"></a></p>
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
  const thumbsEl = root.querySelector(".shareCard__thumbs");
  const ctaEl = root.querySelector(".shareCard__cta");
  const urlLinkEl = root.querySelector(".shareCard__urlLink");
  const qrEl = root.querySelector(".shareCard__qr");
  const nativeBtn = root.querySelector("[data-share-native]");
  const downloadBtn = root.querySelector("[data-share-download]");

  const canUseNativeShare = window.isSecureContext && typeof navigator.share === "function";
  nativeBtn.classList.toggle("hidden", !canUseNativeShare);

  let context = null;
  let cachedBlob = null;
  let cachedKey = null;
  let previousOverflow = "";
  let renderTask = Promise.resolve();
  const orientationCache = new Map();
  let renderedThumbCount = 0;

  function getShareCopy() {
    if (!context) return null;
    return buildShareCopy({
      netValue: context.netAfterChexy,
      cardCount: context.best?.combo?.length || 0
    });
  }

  function contextKey(value) {
    if (!value?.best) return "";
    const comboIds = (value.best.combo || []).map((card) => card.id).join(",");
    return [comboIds, Number(value.netAfterChexy || 0).toFixed(2), value.shareUrl || ""].join("|");
  }

  async function applyContext() {
    if (!context?.best) return;
    const copy = getShareCopy();

    kickerEl.textContent = copy.kicker;
    headlineEl.textContent = copy.headline;
    heroValueEl.textContent = copy.heroValue;
    heroLabelEl.textContent = copy.heroValueLabel;
    ctaEl.textContent = copy.cta;

    const shareUrl = context.shareUrl || window.location.href;
    const quickSetupUrl = getQuickSetupUrl(shareUrl);
    urlLinkEl.textContent = getQuickSetupLabel(quickSetupUrl);
    urlLinkEl.href = quickSetupUrl;

    await renderThumbRows(context.best.combo || []);

    qrEl.crossOrigin = "anonymous";
    qrEl.referrerPolicy = "no-referrer";
    qrEl.src = `${QR_ENDPOINT}${encodeURIComponent(shareUrl)}`;
  }


  function setThumbSizeVars(landscapeSize, portraitSize) {
    thumbsEl.style.setProperty("--share-thumb-landscape", `${landscapeSize}px`);
    thumbsEl.style.setProperty("--share-thumb-portrait", `${portraitSize}px`);
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

    const { landscapeSize, portraitSize } = thumbSizesForCount(sorted.length, shareCard);
    setThumbSizeVars(landscapeSize, portraitSize);

    renderedThumbCount = sorted.length;

    const rows = buildThumbRows(sorted);
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

    fitThumbsToAvailableSpace();
  }

  function fitThumbsToAvailableSpace() {
    if (thumbsEl.clientWidth <= 0 || thumbsEl.clientHeight <= 0) return;

    const cardWidth = Math.max(1, shareCard.clientWidth);
    const liveCount = Math.max(1, renderedThumbCount || thumbsEl.querySelectorAll(".shareCard__thumb").length || 1);
    // Internal proportions follow panel/card size.
    const { landscapeSize, portraitSize } = thumbSizesForCount(liveCount, shareCard);
    let nextLandscape = landscapeSize;
    let nextPortrait = portraitSize;
    setThumbSizeVars(nextLandscape, nextPortrait);

    const minThumb = Math.max(1, cardWidth * 0.065);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const rowWidths = [...thumbsEl.querySelectorAll(".shareCard__thumbRow")].map((row) => row.scrollWidth);
      const widestRow = Math.max(0, ...rowWidths);
      const overWidth = widestRow > thumbsEl.clientWidth;
      const overHeight = thumbsEl.scrollHeight > thumbsEl.clientHeight;
      if (!overWidth && !overHeight) break;

      nextLandscape = Math.max(minThumb, nextLandscape * 0.9);
      nextPortrait = Math.max(minThumb, nextPortrait * 0.9);
      setThumbSizeVars(nextLandscape, nextPortrait);
    }
  }

  function open() {
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => fitThumbsToAvailableSpace());
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
    renderTask = applyContext();
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
    await renderTask;
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

function buildThumbRows(sortedCards) {
  if (sortedCards.length === 5) return [sortedCards.slice(0, 3), sortedCards.slice(3, 5)];
  if (sortedCards.length === 4) return [sortedCards.slice(0, 2), sortedCards.slice(2, 4)];
  return [sortedCards];
}

function thumbSizesForCount(count, shareCard) {
  const safeCount = Math.max(1, Number(count) || 1);
  const cardWidth = Math.max(1, shareCard?.clientWidth || 1);
  const sizeRatio = safeCount === 1
    ? 0.34
    : safeCount === 2
      ? 0.24
      : safeCount === 3
        ? 0.19
        : safeCount === 4
          ? 0.2
          : 0.17;
  const derivedSize = cardWidth * sizeRatio;

  // Internal proportions follow panel/card size.
  return { landscapeSize: derivedSize, portraitSize: derivedSize };
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


function getQuickSetupUrl(url) {
  try {
    const next = new URL(url || window.location.href);
    next.pathname = "/quick-setup";
    next.search = "";
    next.hash = "";
    return next.toString();
  } catch {
    return `${window.location.origin}/quick-setup`;
  }
}

function getQuickSetupLabel(url) {
  try {
    const next = new URL(url);
    return `${next.host}/quick-setup`;
  } catch {
    return "creditcombo.ca/quick-setup";
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
  await Promise.all(images.map(async (img) => {
    if (!img.complete) {
      await new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }
    if (typeof img.decode === "function") {
      try {
        await img.decode();
      } catch {
        // ignore decode errors and continue with best-effort rendering
      }
    }
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
  const stylePairs = Array.from(computed).map((prop) => [prop, computed.getPropertyValue(prop)]);

  if (source.classList?.contains("shareCard__thumb")) {
    stylePairs.push(["border", "none"]);
    stylePairs.push(["box-shadow", "none"]);
    stylePairs.push(["background", "transparent"]);
  }

  const cssText = stylePairs.map(([prop, value]) => `${prop}:${value};`).join("");
  target.setAttribute("style", cssText);
}

async function inlineImageSources(sourceRoot, targetRoot) {
  const sourceImages = [...sourceRoot.querySelectorAll("img")];
  const targetImages = [...targetRoot.querySelectorAll("img")];

  await Promise.all(sourceImages.map(async (sourceImage, idx) => {
    const targetImage = targetImages[idx];
    if (!targetImage) return;

    const src = sourceImage.currentSrc || sourceImage.src || sourceImage.getAttribute("src");
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
