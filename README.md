Card Combo Optimizer (MVP)
========================

A small static web app that recommends an “ideal” long‑term Canadian credit‑card combo (1–5 cards) based on your monthly spend by category. It loads card and rewards-program data from JSON files, estimates annual rewards value minus fees, and outputs simple “use this card for this category” instructions.

What it does
------------
- Prompts for:
  - Number of cards to hold (1–5)
  - Monthly spend per category (from cards.json schema)
- Computes:
  - Best card set (up to k cards)
  - Estimated annual gross rewards value
  - Annual fees
  - Net value (gross − fees)
  - Category-by-category usage instructions

What it does NOT do (yet)
-------------------------
- It does not model merchant-/portal-specific multipliers listed in special_earn_rules
  (e.g., “Air Canada direct”, “Expedia for TD”, specific hotel chains).
- It does not model MCC quirks or acceptance constraints (e.g., Amex acceptance).
- It ignores one-time promotions / welcome bonuses; this is intended for a long-term setup.

Eligibility rules for cards
---------------------------
Cards are excluded from optimization if:
- rewards_program is missing, OR
- rewards_program is not found in programs.json, OR
- program_type is "points" and cents_per_point is null

Excluded cards (and reasons) appear under “Data issues” in the UI.

Project structure
-----------------
your-folder/
  index.html
  styles.css
  cards.json
  programs.json
  src/
    app.js        # bootstraps UI, loads data, runs optimizer
    data.js       # fetch + normalization + card eligibility filtering
    optimizer.js  # combo search + cap handling + scoring
    ui.js         # rendering + input helpers

Run locally
-----------
1) Put index.html, styles.css, cards.json, programs.json in the same folder.
2) Start a static server:
   npx serve .
3) Open the local URL shown in the terminal.

Data format (high level)
------------------------
cards.json
- meta.category_schema_modeled: list of categories (strings)
- cards[] items include:
  - id, card_name, issuer, network
  - rewards_program: program_id (string)
  - annual_fee: { amount, type }
  - earn_rates: { category: number, other: number }
  - caps: optional list of cap rules
  - special_earn_rules: optional list (ignored by optimizer for now)

programs.json
- programs[] items include:
  - program_id
  - program_name
  - program_type: "points" | "cashback"
  - cents_per_point (required for "points"; for cashback it can be 1.0)

Optimizer notes
--------------
- Values are computed as:
  - points programs: (points per $) * (cents per point) / 100
  - cashback programs: (percent) / 100
- Caps are handled by:
  1) assigning each category to the best card in the combo
  2) rerouting overflow in capped buckets to the next-best card where possible
  3) if still over, valuing overflow at earn_rate_above_cap for that cap rule

License / disclaimer
--------------------
This is an MVP for experimentation. Numbers are estimates; real-world results depend on merchant coding, acceptance, and redemption choices.
