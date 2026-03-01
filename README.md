# CreditCombo

CreditCombo is a static web app that helps you build a long-term Canadian credit-card setup based on your monthly spending.

## What the app does

- Recommends an optimal card combo from available data.
- Lets you choose up to 5 cards (or 0 to clear results).
- Supports two valuation modes:
  - **Estimated value**
  - **Minimum guaranteed value**
- Applies annual fees and returns net annual value.
- Shows category-by-category card usage guidance.
- Supports practical filters such as:
  - Locking in cards you already have
  - Excluding business cards
  - Excluding cashback programs
  - Excluding specific rewards programs
  - Setting a maximum annual fee

## Current modeling limits

- Merchant-specific and portal-specific multipliers are not modeled.
- MCC edge cases and card acceptance constraints are not modeled.
- Welcome bonuses and short-term promos are not modeled.

## Run locally

```bash
npx serve .
```

Then open the local URL printed in your terminal.

## Deploy (Cloudflare Workers)

`wrangler.toml` is configured to serve this repo as static assets through a Worker (`src/worker.js`).

```bash
npx wrangler deploy
```

## Data files

- `data/cards.json`
- `data/programs.json`

Cards without valid rewards-program valuation data are excluded from optimization and surfaced in the UI under **Data issues**.

## Project structure

```text
index.html            # Optimizer page
cards.html            # Card browser page
valuations.html       # Valuation guide page
src/
  app.js
  optimizer.js
  optimizer-worker.js
  data-service.js
  worker.js
styles/
  base.css
  optimizer.css
  browser.css
data/
  cards.json
  programs.json
```

## Disclaimer

This project is for estimation and comparison only. Real-world value depends on redemption method, merchant coding, and card acceptance.
