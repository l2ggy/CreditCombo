import { renderCardThumb } from "./render.js";
import { buildSearchText, scoreSearchMatch, tokenizeSearchQuery } from "./search.js";

export function createCardSearchIndex(cards = []) {
  return cards.map((card) => ({
    card,
    fullSearchText: buildSearchText([card.card_name, card.issuer, card.network]),
    nameSearchText: buildSearchText(card.card_name)
  }));
}

export function rankCardMatches(index, query, { excludeCardIds = new Set(), limit = 10 } = {}) {
  const queryTokens = tokenizeSearchQuery(query);
  if (!queryTokens.length) return [];

  return index
    .filter(({ card }) => !excludeCardIds.has(card.id))
    .map((entry) => {
      const fullScore = scoreSearchMatch(entry.fullSearchText, queryTokens);
      if (fullScore < 0) return null;
      const nameScore = scoreSearchMatch(entry.nameSearchText, queryTokens);
      const totalScore = fullScore + (nameScore > 0 ? nameScore * 3 : 0);
      return { card: entry.card, totalScore };
    })
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore || a.card.card_name.localeCompare(b.card.card_name))
    .slice(0, limit)
    .map(({ card }) => card);
}

export function renderCardSearchOptions(optionsEl, cards, {
  optionClass = "listOption",
  thumbClass = "thumb thumb-xs thumb-contain",
  getAriaLabel = (card) => `Select ${card.card_name} (${card.issuer})`,
  dataAttribute = "cardId"
} = {}) {
  optionsEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  cards.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = optionClass;
    button.dataset[dataAttribute] = card.id;
    button.dataset.optionIndex = String(index);
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.setAttribute("aria-label", getAriaLabel(card));

    const thumbWrap = document.createElement("span");
    thumbWrap.className = "cardSearchThumb";
    thumbWrap.append(renderCardThumb(card, { className: thumbClass, withFrame: false }));
    button.append(thumbWrap);

    const label = document.createElement("span");
    label.textContent = `${card.card_name} `;
    const issuer = document.createElement("span");
    issuer.className = "muted";
    issuer.textContent = `(${card.issuer})`;
    label.append(issuer);
    button.append(label);

    fragment.append(button);
  });

  optionsEl.append(fragment);
}


export function bindCardSearchKeyboard(inputEl, optionsEl, onSelect) {
  inputEl.addEventListener("keydown", (event) => {
    const options = [...optionsEl.querySelectorAll("[data-card-id]")];
    if (!options.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      options[0].focus();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onSelect(options[0].dataset.cardId);
    }
  });

  optionsEl.addEventListener("keydown", (event) => {
    const option = event.target.closest("[data-card-id]");
    if (!option) return;
    const options = [...optionsEl.querySelectorAll("[data-card-id]")];
    const idx = options.indexOf(option);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      (options[idx + 1] || options[0]).focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      (options[idx - 1] || inputEl).focus();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onSelect(option.dataset.cardId);
    }
  });
}
