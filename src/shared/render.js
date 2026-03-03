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
    className = "thumb thumb-md thumb-contain",
    withFrame = true,
    frameClass = "thumbWrap"
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


export function formatIssuerNetwork(card) {
  const issuer = typeof card?.issuer === "string" ? card.issuer.trim() : "";
  const network = typeof card?.network === "string" ? card.network.trim() : "";

  if (issuer && network) {
    return issuer === network ? issuer : `${issuer} · ${network}`;
  }

  return issuer || network;
}

export function renderLockedChip(card) {
  const chip = document.createElement("span");
  chip.className = "chip";

  chip.append(renderCardThumb(card, { className: "thumb thumb-xs thumb-contain", withFrame: false }));

  const label = document.createElement("span");
  label.textContent = `${card.card_name} (${card.issuer})`;
  chip.append(label);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "chipRemove";
  remove.dataset.removeId = card.id;
  remove.setAttribute("aria-label", `Remove locked card ${label.textContent}`);
  remove.textContent = "×";
  chip.append(" ", remove);

  return chip;
}

export function getOfficialCardUrl(card) {
  const directOfficialLink = card?.official_link;
  if (typeof directOfficialLink === "string" && /^https?:\/\//i.test(directOfficialLink)) {
    return directOfficialLink;
  }

  return null;
}

export function renderOfficialCardLink(card, label = "Official") {
  const officialUrl = getOfficialCardUrl(card);
  if (!officialUrl) return null;

  const link = document.createElement("a");
  link.className = "textLink officialLink";
  link.href = officialUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = `↗ ${label}`;
  link.setAttribute("aria-label", `Open official page for ${card.card_name}`);
  return link;
}

export function renderResultCardItem(card) {
  const item = document.createElement("li");
  item.className = "itemRow";
  item.append(renderCardThumb(card));

  const details = document.createElement("div");

  const title = document.createElement("b");
  title.textContent = card.card_name;
  details.append(title, " ");

  const issuerNetwork = formatIssuerNetwork(card);
  if (issuerNetwork) {
    const issuer = document.createElement("span");
    issuer.className = "muted";
    issuer.textContent = `(${issuerNetwork})`;
    details.append(issuer, " — ");
  }

  details.append("fee ");

  const fee = Number(card.annual_fee?.amount ?? 0);
  const feeEl = document.createElement("span");
  feeEl.className = "mono";
  feeEl.textContent = `${formatMoneyCAD(fee)}/yr`;
  details.append(feeEl);

  const officialLink = renderOfficialCardLink(card);
  if (officialLink) {
    details.append(" · ", officialLink);
  }

  item.append(details);
  return item;
}
