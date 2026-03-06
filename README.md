# CreditCombo

CreditCombo is a static web app that helps you build a long-term Canadian credit-card setup from your monthly spending profile.

## What the app does

- Optimizes card combinations from the modeled dataset.
- Supports manual setup (`index.html`) and guided setup (`quick-setup.html`).
- Lets you lock in current cards and add additional cards.
- Supports two valuation modes:
  - **Estimated value**
  - **Minimum guaranteed value**
- Applies annual fees and reports net annual value.
- Shows category/subcategory “which card to use” guidance.
- Includes practical filters such as:
  - Including business cards
  - Excluding cashback programs
  - Excluding specific rewards programs
  - Setting a maximum annual fee
- Includes a full card browser (`cards.html`) and shareable optimizer results, with a full-width primary share action directly under result value details.

## Current modeling limits

- Unstructured merchant/portal `special_earn_rules` are not modeled.
- MCC edge cases and broad acceptance constraints are not fully modeled.
- Welcome bonuses and short-term promos are not modeled.

## Run locally

```bash
npx serve .
```

Then open the local URL printed in your terminal.

## Deploy (Cloudflare Workers)

`wrangler.toml` serves this repo as static assets through a Worker (`src/worker.js`) that also applies route rewrites and security headers.

```bash
npx wrangler deploy
```

## Data files

- `data/cards.json`
- `data/programs.json`
- `data/subcategories.json`

Cards without valid rewards-program valuation data are excluded from optimization and surfaced in the UI under **Data issues**.

## Project structure

```text
index.html            # Optimizer page (manual setup)
quick-setup.html      # Guided setup page
cards.html            # Card browser page
valuations.html       # Valuation guide page
src/
  app.js
  quick-setup.js
  card-browser.js
  optimizer.js
  optimizer-worker.js
  data-service.js
  worker.js
styles/
  base.css
  optimizer.css
  browser.css
  quick-setup.css
data/
  cards.json
  programs.json
  subcategories.json
```

## Disclaimer

This project is for estimation and comparison only. Real-world value depends on redemption method, merchant coding, card acceptance, and issuer policy changes.
