CreditCombo (MVP)
========================

A small static web app that recommends an “ideal” long‑term Canadian credit‑card combo (1–5 cards) based on your monthly spend by category. It loads card and rewards-program data from JSON files, estimates annual rewards value minus fees, and outputs simple “use this card for this category” instructions.

What it does
------------
- Prompts for:
  - Number of cards to hold (1–5)
  - Monthly spend per category (from data/cards.json schema)
  - Points valuation mode: estimated vs minimum guaranteed redemption value
- Computes:
  - Best card set (searches all set sizes from 1..k)
  - Annual gross rewards value (based on selected valuation mode)
  - Annual fees
  - Net value (gross − fees)
  - Category-by-category usage instructions

What it does NOT do (yet)
-------------------------
- Merchant- or portal-specific `special_earn_rules` are intentionally ignored.
- MCC quirks and acceptance constraints are not modeled.
- One-time promotions and welcome bonuses are not modeled.

Eligibility rules for cards
---------------------------
Cards are excluded from optimization if:
- rewards_program is missing, OR
- rewards_program is not found in data/programs.json, OR
- program_type is "points" and cents_per_point is null
  (minimum_cents_per_point is used for minimum guaranteed mode and is populated for all current points programs)

Excluded cards (and reasons) appear under “Data issues” in the UI.

Project structure
-----------------
your-folder/
  index.html
  styles.css
  data/
    cards.json
    programs.json
  src/
    app.js        # bootstraps UI, loads data, runs optimizer
    data.js       # fetch + normalization + card eligibility filtering
    optimizer.js  # combo search + cap handling + scoring
    ui.js         # rendering + input helpers


Deploy on Cloudflare Workers
----------------------------
Use one Worker + static assets for both production and previews.
Worker entrypoint: `src/worker.js`.


- Production: `npx wrangler deploy`
- Branch previews: `npx wrangler versions upload --preview-alias <branch-name>`

This works because `versions upload` versions a Worker script (`main`), while the Worker serves your static files through the `ASSETS` binding.

Run locally
-----------
1) Keep data files in ./data (cards.json and programs.json) beside index.html and styles.css.
2) Start a static server:
   npx serve .
3) Open the local URL shown in the terminal.

Data format (high level)
------------------------
data/cards.json
- meta.category_schema_modeled: list of categories (strings)
- cards[] items include:
  - id, card_name, issuer, network
  - rewards_program: program_id (string)
  - annual_fee: { amount, type }
  - earn_rates: { category: number, other: number }
  - caps: optional list of cap rules
  - special_earn_rules: optional list (ignored by optimizer for now)

data/programs.json
- programs[] items include:
  - program_id
  - program_name
  - program_type: "points" | "cashback"
  - cents_per_point (required for "points"; cashback is always treated as face-value cashback, i.e. 1.0 cpp equivalent)
  - minimum_cents_per_point (used in minimum guaranteed mode; populated for all current points programs)
  - minimum_valuation_note (short rationale/source for the minimum floor)

Optimizer notes
--------------
- Rules modeled in scoring are intentionally narrow:
  - Two valuation modes are modeled: estimated points value and minimum guaranteed redemption value.
  - Category spend is assigned to the best card, cap overflow is rerouted to the next-best card, and residual overflow can earn at the above-cap rate.
  - Annual fees are subtracted from gross rewards to report net annual value.
- Reward value per $ is computed as:
  - points programs: `(points per $) * (effective cents per point) / 100`
    - effective cpp = `cents_per_point` in estimated mode
    - effective cpp = `minimum_cents_per_point` in minimum guaranteed mode (falls back to `cents_per_point` if a future program entry omits it)
  - cashback programs: `(percent) / 100` (cashback is treated as a fixed 1.0 cpp equivalent)
- To keep runtime practical on large card sets, it narrows to a candidate pool before evaluating all combinations from size 1..k. The pool is built by combining:
  - top cards per active spend category (high value-per-dollar in that category),
  - top cards by overall weighted potential (using your spend mix and annual fees),
  - a small set of lowest-fee cards (to preserve low-fee combo options),
  then trimming that merged set to a size limit derived from a target max combination count.

License / disclaimer
--------------------
This is an MVP for experimentation. Numbers are estimates; real-world results depend on merchant coding, acceptance, and redemption choices.
