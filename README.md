# CreditCombo

CreditCombo is a static web app that helps you choose a long-term Canadian credit-card setup (up to 5 cards) using your monthly spending profile.

It compares eligible cards from `data/cards.json` and rewards programs from `data/programs.json`, then estimates annual rewards value, annual fees, and net value for each candidate combo.

## What the app includes

- **Optimizer (`index.html`)**
  - Monthly spend input by category.
  - Card-count slider (`0–5`), where `0` means “no additional cards unless cards are locked.”
  - Points valuation mode selector:
    - **Estimated value**
    - **Minimum guaranteed value**
  - Advanced preferences:
    - Exclude business cards
    - Exclude cashback programs
    - Set maximum annual fee
    - Exclude specific rewards programs
    - Lock in cards you already hold
  - Results summary with gross rewards, fees, and net value.
  - Category-by-category spend allocation guidance.

- **Card browser (`cards.html`)**
  - Search, filter, and sort all modeled cards.

- **Valuation guide (`valuations.html`)**
  - Explains how estimated and minimum-guaranteed program valuations are interpreted.

## What is modeled

- Category-based earn rates (`earn_rates`) and optional caps (`caps`).
- Rewards value conversion using program metadata (`cents_per_point`, `minimum_cents_per_point`).
- Annual fee subtraction from gross value to produce net annual value.
- Combination search from size `1..k` over a narrowed candidate pool for runtime control.

## What is not modeled (current limitations)

- Merchant- or portal-specific multipliers in `special_earn_rules`.
- Merchant category code (MCC) edge cases.
- Card acceptance constraints by merchant/network.
- Temporary promos and welcome bonuses.
- Secondary cardholder/household sharing nuances.

## Eligibility filtering

A card is excluded from optimization if:

- `rewards_program` is missing,
- its rewards program is not found in `data/programs.json`, or
- it is a points card with missing `cents_per_point`.

Excluded cards are surfaced in the UI under **Data issues (excluded cards)**.

## Data model (high level)

### `data/cards.json`

- `meta.category_schema_modeled`: array of spend categories.
- `cards[]` entries include core fields such as:
  - `id`, `card_name`, `issuer`, `network`
  - `rewards_program`
  - `annual_fee` (`amount`, `type`)
  - `earn_rates`
  - optional `caps`
  - optional `special_earn_rules` (currently ignored by optimizer)

### `data/programs.json`

- `programs[]` entries include:
  - `program_id`, `program_name`
  - `program_type` (`points` or `cashback`)
  - `cents_per_point` (primary estimated valuation)
  - `minimum_cents_per_point` (floor used in minimum-guaranteed mode)
  - `minimum_valuation_note` (rationale/source note)

## Reward valuation logic

CreditCombo compares programs on a cash-equivalent basis:

- **Points programs**
  - value per dollar = `(points per $) * (effective cpp) / 100`
  - `effective cpp` is:
    - `cents_per_point` in **Estimated value** mode
    - `minimum_cents_per_point` in **Minimum guaranteed value** mode
- **Cashback programs**
  - value per dollar = `(cashback percent) / 100`

## Project structure

```text
.
├── index.html               # Optimizer UI
├── cards.html               # Card browser
├── valuations.html          # Valuation guide
├── src/
│   ├── app.js               # Optimizer bootstrap + event wiring
│   ├── optimizer.js         # Combo search + scoring
│   ├── optimizer-worker.js  # Worker-side optimization orchestration
│   ├── card-browser.js      # Card browser page logic
│   ├── ui.js                # Optimizer rendering helpers
│   └── worker.js            # Cloudflare Worker request handler
├── data/
│   ├── cards.json
│   └── programs.json
├── styles/
│   ├── tokens.css
│   ├── base.css
│   ├── optimizer.css
│   └── browser.css
└── wrangler.toml
```

## Run locally

Because this is a static site, you can use any local static server from the repository root.

Examples:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then open:

- `http://localhost:8080/index.html` (optimizer)
- `http://localhost:8080/cards.html` (browser)
- `http://localhost:8080/valuations.html` (valuation guide)

## Deploy on Cloudflare Workers

This repo uses one Worker (`src/worker.js`) plus an `ASSETS` binding to serve static files.

```bash
# Production deploy
npx wrangler deploy

# Preview version with alias
npx wrangler versions upload --preview-alias <branch-name>
```

## Card naming conventions (data hygiene)

- Prefer issuer/product display names without trailing “Card” / “Credit Card” unless removing it changes brand meaning.
- Keep official branding symbols where appropriate (for example: ™, †, ‡, +).

## Disclaimer

CreditCombo is an estimation tool for planning and comparison. Real-world outcomes vary based on merchant coding, issuer terms, redemption choices, and changing program policies.
