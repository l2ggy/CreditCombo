import { formatMoneyCAD } from "./format.js";

function bindThumbImageBehavior(img) {
  img.addEventListener("load", () => {
    img.classList.toggle("is-portrait", img.naturalHeight > img.naturalWidth);
  });

  img.addEventListener("error", () => {
    img.remove();
  });
}

export function renderCardThumb(card, options = {}) {
  const {
    className = "resultCardThumb",
    withFrame = true,
    frameClass = "thumbFrame"
  } = options;

  const img = document.createElement("img");
  img.className = className;
  img.src = `./assets/cards/${card.id}.webp`;
  img.alt = card.card_name;
  img.loading = "lazy";
  img.decoding = "async";
  bindThumbImageBehavior(img);

  if (!withFrame) return img;

  const frame = document.createElement("span");
  frame.className = frameClass;
  frame.append(img);
  return frame;
}

export function renderLockedChip(card) {
  const chip = document.createElement("span");
  chip.className = "lockedChip";

  chip.append(renderCardThumb(card, { className: "lockedCardThumb", withFrame: false }));

  const label = document.createElement("span");
  label.textContent = `${card.card_name} (${card.issuer})`;
  chip.append(label);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "lockedChipRemove";
  remove.dataset.removeId = card.id;
  remove.setAttribute("aria-label", `Remove ${label.textContent}`);
  remove.textContent = "×";
  chip.append(" ", remove);

  return chip;
}

export function renderResultCardItem(card) {
  const item = document.createElement("li");
  item.className = "resultCardItem";
  item.append(renderCardThumb(card));

  const details = document.createElement("div");

  const title = document.createElement("b");
  title.textContent = card.card_name;
  details.append(title, " ");

  const issuer = document.createElement("span");
  issuer.className = "muted";
  issuer.textContent = `(${card.issuer})`;
  details.append(issuer, " — ");

  const network = document.createElement("span");
  network.className = "mono";
  network.textContent = card.network;
  details.append(network, " — fee ");

  const fee = Number(card.annual_fee?.amount ?? 0);
  const feeEl = document.createElement("span");
  feeEl.className = "mono";
  feeEl.textContent = `${formatMoneyCAD(fee)}/yr`;
  details.append(feeEl);

  item.append(details);
  return item;
}
