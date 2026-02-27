# Repository-wide QA Review (Static, Read-only)

Date: 2026-02-27  
Scope: Frontend, optimizer/domain logic, data utilities, deployment/config, and test posture.

## 1) Project structure and major modules

### Core app areas
- **UI/pages**: `index.html`, `cards.html`, `valuations.html`.
- **Frontend logic**:
  - `src/app.js`: main optimizer page orchestration, locked-cards UX, wiring and memoization.
  - `src/ui.js`: rendering helpers (spend table, issues, results).
  - `src/card-browser.js`: all-cards explorer filters/sorting/rendering.
- **Domain logic**:
  - `src/optimizer.js`: spend annualization, card valuation, cap rerouting, combination search, candidate pruning.
- **Data services / data model normalization**:
  - `src/data.js`: JSON load, rewards-program normalization, card eligibility filtering.
  - `data/cards.json`, `data/programs.json`.
- **Runtime/deploy config**:
  - `src/worker.js`: static asset fetch + root icon path rewrites.
  - `wrangler.toml`: Worker entrypoint and assets binding.
- **Styling**:
  - `styles.css`: shared styles for all pages.

### Ownership boundaries and overlaps
- Clear split exists between UI rendering (`ui.js`) and optimization (`optimizer.js`), but orchestration and state management are heavily centralized in `app.js`.
- Escaping/sanitization logic is duplicated (`escapeHtml` appears in multiple files) rather than being a shared utility.
- Card-browser data presentation directly uses raw data and partially duplicates formatting logic already present in optimizer UI flows.

## 2) Code quality and maintainability review

### Findings
- `src/app.js` is a large orchestrator with many nested closures, UI state transitions, filtering rules, and cache behavior mixed together. This increases cognitive load and makes isolated testing difficult.
- Input/data validation is narrow: `validateAndFilterCards` only enforces program linkage / missing CPP for points but does not strongly validate earn-rate numeric types, cap fields, or malformed card metadata.
- Error handling style is inconsistent:
  - `app.js` catches generic errors and interpolates `e.message` directly.
  - `card-browser.js` has a different fallback pattern.
  - Lower-level `loadJson` throws, but no central error-policy convention exists.
- Logging and diagnostics are minimal (UI-only messaging), which can make production incident triage harder.

## 3) Logic and behavior verification (static flow tracing)

### Critical flow traces
1. **Main optimizer flow (index):**
   - load JSON -> normalize programs -> filter eligible cards -> read spend -> compute annual spend -> evaluate combos -> render best combo and per-category card usage.
2. **Locked-card flow:**
   - selected locked IDs are retained in a Set, validated against eligible IDs, and then combined with additional candidates constrained by fee/business toggles.
3. **Card browser flow:**
   - load raw cards/programs -> build issuer/program filters -> client-side filter/sort -> render cards and caps.

### Edge-case and consistency risks
- Exclusion toggles (annual-fee/business) only constrain **additional candidate cards** in optimizer mode; locked cards can bypass those filters by design. This is defensible but should be explicitly labeled in UI copy to avoid expectation mismatch.
- Candidate-combo memoization in `app.js` uses a process-lifetime map with no eviction; prolonged sessions and high variation in inputs can accumulate memory.
- Browser page (`card-browser.js`) does not use the same eligibility filtering path as optimizer (`validateAndFilterCards`), which may expose cards in browser that optimizer excludes without explicit status messaging.

## 4) UI/UX and visual consistency audit

### Positive baseline
- Shared style tokens and panel/grid system are reused well across pages.
- Component classes for cards, chips, grids, and controls are mostly consistent.

### Issues
- Mobile/assistive accessibility concern: all pages set viewport to `maximum-scale=1,user-scalable=no`, which blocks pinch-zoom.
- Keyboard focus discoverability is weak in places:
  - Inputs/selects have focus styling, but buttons/links/components have limited explicit `:focus-visible` treatment.
  - Tooltip behavior for card usage uses hover-only pseudo-elements and no keyboard/focus equivalent.
- Browser and optimizer pages are stylistically aligned, but error/empty states vary in wording and structure.

## 5) Architecture and design integrity

### Observations
- Layering direction is mostly correct (data -> domain -> presentation).
- `app.js` currently violates separation depth by combining:
  - state model,
  - DOM event wiring,
  - domain invocation,
  - view model assembly,
  - and cache policy.

### Standardization opportunities
- Extract a reusable “view model/controller” layer for optimizer page state transitions.
- Consolidate escaping and formatting helpers (`escapeHtml`, currency/multiplier formatters).
- Introduce a shared data-contract validation module and invoke it in both optimizer and browser paths.

## 6) Testing and QA coverage assessment

### Current state
- No unit, integration, or e2e test suite is present in-repo.
- No automated static checks (lint/type tests) are configured in visible project files.

### High-risk uncovered paths
- Cap rerouting and above-cap valuation in `optimizer.js` (multi-cap interactions, tie-breaking, overflow redistribution correctness).
- Locked-card constraints + k-range behavior in `app.js`.
- Data normalization/eligibility edge-cases (missing/malformed values).
- Browser filtering/sorting correctness and stability under unusual data values.

### Targeted test additions
- Unit tests for `optimizer.js`:
  - cap annualization (`monthly` vs `annual`),
  - rerouting correctness,
  - equal-net tie-breaking (fewer cards),
  - candidate-pruning invariants.
- Unit tests for `data.js` validation and normalization boundaries.
- Integration DOM tests for key `app.js` flows (no-spend message, locked-cards behavior, exclusion toggle behavior).
- Lightweight e2e smoke for pages loading and major interaction paths.

## 7) Security, resilience, and performance hygiene

### Security
- Rendering in `card-browser.js` uses `innerHTML` with raw card/program fields (e.g., card name/issuer/network/program/category), creating XSS risk if data is ever tainted.
- Similar template interpolation patterns in `app.js` locked-card search output should be consistently escaped and/or rendered via DOM APIs.

### Resilience
- Fetches do not include retry/backoff or timeout wrappers; transient network failures surface directly as fatal UI messages.
- Worker is intentionally thin, but there is no cache-control policy layer for data JSON freshness/perf tuning.

### Performance
- Combination search is pruned (good), but remains potentially expensive on broad candidate sets.
- `comboCache` in `app.js` has no size cap/TTL and may grow unbounded during long sessions.

## 8) Prioritized findings report

## Critical
1. **Potential XSS in card browser templating**
   - **Impacted paths:** `src/card-browser.js`.
   - **Why it matters:** Unsanitized `innerHTML` interpolation of data-file fields can execute script if source data is compromised.
   - **User impact:** Account/session compromise risk in browser context; trust and security degradation.
   - **Remediation:** Use safe DOM construction (`textContent`, `createElement`) or centralized HTML-escaping for every interpolated field. Add regression tests with hostile strings.

## High
2. **No automated tests for optimizer/business-critical logic**
   - **Impacted paths:** `src/optimizer.js`, `src/app.js`, `src/data.js`.
   - **Why it matters:** Core recommendation correctness can regress silently.
   - **User impact:** Incorrect card recommendations and financial decision risk.
   - **Remediation:** Add unit test suite for optimizer and validation logic; add integration tests for key UI flows.

3. **Accessibility blocker: zoom disabled globally**
   - **Impacted paths:** `index.html`, `cards.html`, `valuations.html`.
   - **Why it matters:** Prevents low-vision users from zooming; fails modern accessibility expectations.
   - **User impact:** Reduced usability/accessibility compliance risk.
   - **Remediation:** Remove `maximum-scale=1,user-scalable=no` from viewport meta.

## Medium
4. **Architecture concentration in `app.js` (high coupling / low testability)**
   - **Impacted paths:** `src/app.js`.
   - **Why it matters:** Harder maintenance, brittle feature additions, harder isolated testing.
   - **User impact:** Slower velocity and increased defect probability over time.
   - **Remediation:** Extract modules for state/controller, locked-card management, and memoization policy.

5. **Unbounded in-memory combo cache**
   - **Impacted paths:** `src/app.js`.
   - **Why it matters:** Memory growth risk in long-lived sessions with many parameter permutations.
   - **User impact:** Potential tab slowdowns over time.
   - **Remediation:** Add LRU/size cap or clear cache on meaningful context boundaries.

6. **Inconsistent data-contract enforcement between optimizer and browser**
   - **Impacted paths:** `src/data.js`, `src/card-browser.js`.
   - **Why it matters:** Different pages can present divergent truths about card validity.
   - **User impact:** Confusion when a card is visible in browser but excluded in optimizer.
   - **Remediation:** Route browser through shared validation status and label ineligible cards explicitly.

## Low
7. **Inconsistent focus/interaction affordances**
   - **Impacted paths:** `styles.css`, `src/ui.js` (hover-only tooltip behavior).
   - **Why it matters:** Keyboard users get weaker affordances and less discoverable details.
   - **User impact:** Reduced UX quality and accessibility.
   - **Remediation:** Add `:focus-visible` styles across interactive controls; provide keyboard-accessible tooltip/details.

8. **Duplicate utility logic (escaping/formatting) across modules**
   - **Impacted paths:** `src/app.js`, `src/ui.js`, `src/card-browser.js`.
   - **Why it matters:** Increases drift risk and inconsistent behavior.
   - **User impact:** Subtle rendering inconsistencies and maintenance overhead.
   - **Remediation:** Introduce shared utility module for escape + formatting concerns.

---

## Consistency baseline to standardize across the codebase

1. **Rendering safety baseline**
   - Prefer DOM API construction + `textContent` for untrusted fields.
   - If templates are used, require shared `escapeHtml` utility and lint rule guidance.

2. **Validation baseline**
   - Define and enforce a shared card/program schema contract at load time.
   - Surface card validity status consistently across optimizer and browser pages.

3. **Error-handling baseline**
   - Standardize user-facing error messages and fallback UI patterns.
   - Add structured logging hooks for load/parse/compute failures.

4. **State-management baseline**
   - Keep orchestration in thin entry modules; move state transitions into testable pure helpers.
   - Put memoization/cache policies behind explicit bounded strategies.

5. **Accessibility baseline**
   - Never disable zoom.
   - Require visible `:focus-visible` states for all interactive controls.
   - Ensure hover-only affordances have keyboard/screen-reader equivalents.

6. **Testing baseline**
   - Minimum unit coverage for optimizer and data validation.
   - Integration smoke tests for critical user flows (load, optimize, filters, errors).
