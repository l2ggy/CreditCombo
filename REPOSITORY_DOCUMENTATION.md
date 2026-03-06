# CreditCombo Repository Documentation (Comprehensive)

## 1) Repository purpose and product scope

CreditCombo is a static, client-rendered web application for modeling Canadian credit-card setups using category spending inputs, card earn rates, reward-program valuation data, annual fees, and card-level constraints. It provides:

- A **manual optimizer** (`index.html`) for direct input control.
- A **guided quick-setup flow** (`quick-setup.html`) that walks users through profile questions before running optimization.
- A **card browser** (`cards.html`) for exploring all modeled cards and detailed category/subcategory earn behavior.
- A **valuation guide** (`valuations.html`) describing valuation methodology and scope assumptions.

The app is shipped as static assets and served through a lightweight Cloudflare Worker (`src/worker.js`) that adds secure response headers and path rewrites for clean entry routes.

---

## 2) High-level architecture

### Frontend model

- Plain HTML entry documents (no framework build step).
- JavaScript ES modules in `src/`.
- CSS split by role (`tokens`, shared base styles, page-specific styles).
- JSON data files (`data/cards.json`, `data/programs.json`, `data/subcategories.json`) loaded at runtime.

### Runtime execution model

1. Entry page loads page-specific module (`src/app.js`, `src/quick-setup.js`, or `src/card-browser.js`).
2. Data service loads cards/programs/subcategory config JSON.
3. Normalization and filtering run (`src/data.js`).
4. Optimization logic runs in a Web Worker (`src/optimizer-worker.js`) using pure engine logic in `src/optimizer.js`.
5. UI renders results, guidance, and share content.

### Deployment model

- `wrangler.toml` binds the whole repository as static assets via `ASSETS` and uses `src/worker.js` as request handler.
- Worker rewrites selected root aliases (for icons + `/quick-setup`) and applies CSP/XFO/referrer hardening headers.

---

## 3) Repository layout and what each part does

## Top-level pages

- `index.html`: Main optimizer UI (spend inputs, filters, lock-in cards, valuation mode, result panel, sharing trigger).
- `quick-setup.html`: Guided setup shell mounted by `src/quick-setup.js`.
- `cards.html`: Full card catalog browser with search/filter/sort.
- `valuations.html`: Human-readable valuation and modeling rules explainer.

## Data files

- `data/cards.json`
  - Core card catalog + metadata.
  - Defines category schema, inclusion taxonomy descriptions, card naming/sort conventions, required fields.
  - Card objects include: issuer/network/program linkage, annual fee, earn rates, caps, special rules notes, sources, optional subcategory rates, and official link.
  - Current dataset size: **151 cards**.

- `data/programs.json`
  - Program catalog and valuation table.
  - Contains estimated and minimum guaranteed cent-per-point values (or cashback face value semantics).
  - Includes meta notes about valuation source philosophy and ordering conventions.
  - Current dataset size: **51 programs**.

- `data/subcategories.json`
  - Subcategory configuration for modeled merchant/portal/network-specific slices.
  - Adds fine-grained spend buckets that roll into parent categories while allowing differential rates per card.
  - Includes configurations such as acceptance constraints, multiplier logic, card/network overrides, and fee adjustments (e.g., Chexy).
  - Current subcategory footprint: **22 subcategories** across **6 parent categories**.

## Source code (`src/`)

### Entry modules

- `src/app.js`
  - Bootstraps main optimizer page.
  - Loads data, initializes UI state/actions/view, applies deep-link hydration, wires events, and manages lifecycle cleanup.

- `src/quick-setup.js`
  - Implements guided wizard flow.
  - Captures user intent/preferences and spending profile, then maps output to optimizer-compatible state and run behavior.

- `src/card-browser.js`
  - Loads all cards and programs, then renders searchable/filterable/sortable card list.
  - Supports earn-rate-oriented sort modes and subcategory earn detail display.

### App state and orchestration (`src/app/`)

- `actions.js`: Central controller for optimizer interactions (reading inputs, running worker, applying filters/locks, deep-link updates, result rendering, share invocation).
- `state.js`: Canonical mutable UI-state factory for optimizer session state.
- `view.js`: DOM element acquisition + view helper methods.
- `deeplink.js`: Query parsing + hydration schema for optimizer state bootstrapping.

### Optimization core

- `optimizer.js`
  - Pure logic for annualization, subcategory expansion, cap handling, valuation conversion, candidate selection, and best-combination search.
  - Handles advanced behaviors:
    - category and shared caps,
    - spend overflow routing,
    - locked-card constraints,
    - include/exclude program filters,
    - cashback-program exclusion,
    - valuation mode switching,
    - Chexy fee adjustment accounting,
    - subcategory network/issuer/card eligibility and mapping.

- `optimizer-worker.js`
  - Worker bridge that receives payload, executes optimizer engine, returns result/error.

### Data loading/validation

- `data-service.js`: Fetches cards/programs/subcategories and exposes optimizer-ready bundles.
- `data.js`: JSON fetch helper + program normalization + card eligibility validation/exclusion reporting.

### Domain declarations

- `domain/rules-manifest.js`: Human-readable manifest describing what is modeled vs explicitly out-of-scope.

### UI rendering/helpers

- `ui.js`
  - Renders spend table, data issues, result cards, annual value table, effective earn-rate callouts, category/subcategory “which card to use” output, and supporting UI details.

- `shared/`
  - `render.js`: shared card/program render snippets (thumb/link/display helpers).
  - `card-search.js`: card search index + ranking.
  - `search.js`: generic tokenization/scoring utilities.
  - `format.js`: CAD/multiplier/percent-format helpers.
  - `sanitize.js`: HTML escaping utility.

### Sharing subsystem (`src/share/`)

- `share-overlay.js`
  - Builds overlay UI, populates share card preview, copies links, produces downloadable/shareable image asset, and integrates with Web Share API where available.
- `share-copy.js`: clipboard + fallback copy behavior.
- `share-context.js`: shared constants/context primitives for share feature.

### Theming and worker

- `theme.js`
  - Theme toggle with system preference detection and local persistence.
- `worker.js`
  - Cloudflare Worker request handler with route rewrites and security headers.

### Subcategory configuration logic

- `subcategory-config.js`
  - Normalization helpers and rule evaluators for mapping parent categories, network-specific overrides, issuer/card gating, and effective subcategory rate computation.

## Styling (`styles/`)

- `tokens.css`: design tokens (colors, spacing, typography primitives).
- `base.css`: global layout and shared components.
- `optimizer.css`: main optimizer page styling.
- `browser.css`: card browser + valuation guide styling.
- `quick-setup.css`: guided setup styling, including the quick-progress fill animation with a low-opacity sheen effect that respects reduced-motion preferences.

## Static assets

- `icons/`: favicon/webmanifest/platform icons.
- `assets/cards/`: card thumb images keyed by card IDs/naming conventions for visual card rendering.

## Meta/config

- `wrangler.toml`: Cloudflare Worker + assets binding configuration.
- `.github/pull_request_template.md`: repo PR note template.
- `README.md`: concise public project overview.

---

## 4) Data model details

## 4.1 `programs.json` semantics

Each program generally includes:

- `program_id`: canonical key used by cards.
- `program_name`: display label.
- `program_type`: typically `points` or `cashback`.
- `cents_per_point`: estimated valuation basis.
- `minimum_cents_per_point`: conservative floor valuation basis.
- notes/status fields as needed.

Normalization behavior in app logic:

- Cashback programs default to face-value handling (`1.0`) if needed.
- Points programs missing valuation data are treated as ineligible for optimization.

## 4.2 `cards.json` semantics

Card record includes required fields:

- identity (`id`, `card_name`, issuer/network),
- rewards link (`rewards_program`),
- business flag,
- annual fee object,
- `earn_rates` category map,
- `caps` array (cap scope/period/overflow rates),
- `special_earn_rules` freeform notes,
- source links + `official_link`,
- optional `subcategory_earn_rates` overrides.

Meta section also captures taxonomy and operational conventions (sort order, naming rules, schema definitions).

## 4.3 `subcategories.json` semantics

Subcategories allow practical modeling of special merchant channels not representable by broad parent categories alone. Important behaviors include:

- Parent-category anchoring.
- Optional network acceptance constraints.
- Optional network-to-category remapping.
- Optional card/issuer eligibility allow-lists.
- Optional card-specific multipliers or explicit subcategory rates.
- Optional fee adjustment flags (Chexy routing cost modeling).

---

## 5) Optimization pipeline, step-by-step

1. **Load + normalize data**
   - Programs normalized; cards validated.
   - Cards lacking usable program valuation mapping are excluded and surfaced as issues.

2. **Read user input**
   - Monthly spend by parent category and configured subcategories.
   - Number of cards/additional cards.
   - Valuation mode.
   - Locked cards, business inclusion, annual-fee ceiling.
   - Program exclusions and cashback exclusion.
   - Chexy fee percent.

3. **Annualize spend + apply subcategory logic**
   - Parent monthly totals annualized.
   - Subcategory spend slices are transformed into virtual spend categories where needed.
   - Card rates for those slices are computed using direct rates or mapped/multiplied parent rates.

4. **Filter eligible candidate cards**
   - Remove cards violating user constraints.
   - Keep locked cards as mandatory base set.

5. **Generate/evaluate candidate combinations**
   - For each candidate combo size, compute gross reward value with cap/overflow handling.
   - Convert earn units to CAD via selected valuation mode.
   - Subtract annual fees to produce net value.

6. **Apply explicit Chexy cost adjustment**
   - Add modeled fee burden to effective cost math and reporting callouts.

7. **Render output**
   - Best combo summary.
   - Gross/fees/net table.
   - Effective earn rate.
   - Detailed “which card to use” instruction list by spend category/subcategory.

---

## 6) UX behavior highlights by page

## Optimizer (`index.html` + app modules)

- Manual spend input table based on dynamic schema.
- Inline category descriptions.
- Locked-card mode with card search chips.
- Advanced filters including business cards, cashback exclusion, max annual fee, and explicit rewards-program exclusion chips.
- Result sharing via overlay.
- Deep-link hydration/serialization support for reproducible scenarios.

## Quick setup (`quick-setup.html` + `quick-setup.js`)

- Opinionated multi-step guided intake.
- Converts guided answers into optimizer-compatible spending and preference state.
- Designed as onboarding shortcut for users who do not want full manual tuning at the start.

## Card browser (`cards.html` + `card-browser.js`)

- Search by card/issuer/network text.
- Program and issuer filters.
- Sort by name, issuer, annual fee, and category earn rate.
- Subcategory-derived earn behavior display where configured.

## Valuation guide (`valuations.html`)

- Explains why two valuation modes exist.
- Documents source philosophy and conservative floors.
- Lists what rules are modeled and what remains out-of-scope.

---

## 7) Worker and security posture

`src/worker.js` adds security and routing behavior:

- Rewrites friendly/legacy root paths (`/quick-setup`, icon aliases).
- Applies headers:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - restrictive `Content-Security-Policy`
- Handles `HEAD` requests cleanly by stripping body while retaining status/headers.

This enables static deployment with controlled browser security defaults without introducing a server framework.

---

## 8) File-by-file responsibilities (concise inventory)

- `README.md`: short public overview.
- `REPOSITORY_DOCUMENTATION.md`: this detailed internal reference.
- `wrangler.toml`: deploy/runtime config.
- `index.html`: optimizer shell.
- `quick-setup.html`: wizard shell.
- `cards.html`: browser shell.
- `valuations.html`: valuation/rules explainer shell.
- `data/cards.json`: card dataset + taxonomy metadata.
- `data/programs.json`: program valuation dataset.
- `data/subcategories.json`: fine-grained spend/merchant modeling config.
- `styles/tokens.css`: design tokens.
- `styles/base.css`: global UI system.
- `styles/optimizer.css`: optimizer visuals.
- `styles/browser.css`: browser/valuation visuals.
- `styles/quick-setup.css`: quick-setup visuals.
- `src/app.js`: optimizer bootstrapping.
- `src/app/actions.js`: optimizer controller logic.
- `src/app/state.js`: optimizer state model.
- `src/app/view.js`: optimizer DOM interface.
- `src/app/deeplink.js`: URL-state parsing/hydration.
- `src/data.js`: fetch/normalize/validate data.
- `src/data-service.js`: composed data loading.
- `src/optimizer.js`: optimization engine.
- `src/optimizer-worker.js`: worker entrypoint.
- `src/ui.js`: optimizer rendering layer.
- `src/card-browser.js`: card catalog experience.
- `src/quick-setup.js`: guided onboarding flow.
- `src/theme.js`: theme persistence + toggle.
- `src/subcategory-config.js`: subcategory rules engine helpers.
- `src/worker.js`: Cloudflare Worker runtime.
- `src/domain/rules-manifest.js`: modeled/out-of-scope declarations.
- `src/shared/render.js`: shared render helpers.
- `src/shared/card-search.js`: search index/ranking.
- `src/shared/search.js`: token/score helpers.
- `src/shared/format.js`: formatting helpers.
- `src/shared/sanitize.js`: sanitization helper.
- `src/share/share-overlay.js`: share modal/preview/image logic.
- `src/share/share-copy.js`: share copy utility.
- `src/share/share-context.js`: share constants/context.
- `icons/*`: PWA/site icon set.
- `assets/cards/*`: card thumbnails for visual card references.
- `.github/pull_request_template.md`: PR template note.

---

## 9) Operational notes for contributors

- The app has no required frontend build pipeline; static serving is enough.
- Data quality directly controls optimizer eligibility.
- When adding cards/programs, preserve sorting/naming conventions documented in JSON metadata.
- `special_earn_rules` are partly documentary; only structured/configured subcategory logic is computationally modeled.
- Keep valuation assumptions and modeled-scope documentation aligned across:
  - `data/programs.json` metadata,
  - `src/domain/rules-manifest.js`,
  - `valuations.html`,
  - `README.md`.

---

## 10) Known modeling boundaries (as implemented)

- Merchant/portal edge cases not represented as structured subcategory config remain out-of-scope.
- MCC-level issuer interpretation differences remain out-of-scope.
- Acceptance constraints beyond configured network-aware subcategory logic remain partial.
- Welcome bonuses and temporary promotions are not included in long-term baseline optimization.

These limits are intentional for stable, comparable, long-horizon card-combo estimates rather than short-term churn optimization.
