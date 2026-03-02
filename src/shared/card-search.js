import { renderCardThumb } from "./render.js";
import { buildSearchText, scoreSearchMatch, tokenizeSearchQuery } from "./search.js";

export function findCardMatches(cards, query, { excludedIds = new Set(), limit = 10 } = {}) {
  const queryTokens = tokenizeSearchQuery(query);
  if (!queryTokens.length) return [];

  return cards
    .filter((card) => !excludedIds.has(card.id))
    .map((card) => {
      const cardNameText = buildSearchText(card.card_name);
      const fullSearchText = buildSearchText([card.card_name, card.issuer, card.network]);
      const fullScore = scoreSearchMatch(fullSearchText, queryTokens);
      if (fullScore < 0) return null;

      const nameScore = scoreSearchMatch(cardNameText, queryTokens);
      const totalScore = fullScore + (nameScore > 0 ? nameScore * 3 : 0);
      return { card, totalScore };
    })
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore || a.card.card_name.localeCompare(b.card.card_name))
    .slice(0, limit)
    .map(({ card }) => card);
}

export function renderCardSearchOption(card, {
  className = "listOption",
  thumbClassName = "thumb thumb-xs thumb-contain",
  thumbWithFrame = false,
  thumbFrameClass = "thumbWrap",
  ariaPrefix = "Select card",
  subtitleClassName = "muted"
} = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.cardId = card.id;
  button.setAttribute("aria-label", `${ariaPrefix} ${card.card_name} (${card.issuer})`);

  button.append(renderCardThumb(card, {
    className: thumbClassName,
    withFrame: thumbWithFrame,
    frameClass: thumbFrameClass
  }));

  const label = document.createElement("span");
  label.textContent = `${card.card_name} `;

  const issuer = document.createElement("span");
  issuer.className = subtitleClassName;
  issuer.textContent = `(${card.issuer})`;

  label.append(issuer);
  button.append(label);
  return button;
}
