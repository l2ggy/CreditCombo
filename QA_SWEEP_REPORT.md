# Static QA Sweep Report

## Scope and dependency map

Primary entry points reviewed:
- `src/optimizer.js`
- `src/optimizer-worker.js`

Optimizer flow (direct + indirect):
1. UI/app orchestration collects spend/preferences in `src/app/actions.js` and dispatches optimizer payload to `src/optimizer-worker.js`.
2. `src/optimizer-worker.js` normalizes program data through `normalizePrograms` from `src/data.js`, then invokes `findBestCombo` from `src/optimizer.js`.
3. `src/optimizer.js` applies spend adjustments/subcategory expansion and ranking logic, consuming subcategory helpers from `src/subcategory-config.js`.
4. Results flow back to UI rendering in `src/ui.js` (plus shared rendering helpers in `src/shared/render.js`).

Optimizer-adjacent modules statically reviewed for integration and duplicate logic:
- `src/app/actions.js`
- `src/app/state.js`
- `src/app/view.js`
- `src/ui.js`
- `src/card-browser.js`
- `src/shared/search.js`
- `src/shared/card-search.js`
- `src/shared/render.js`
- `src/shared/format.js`
- `src/subcategory-config.js`
- `src/data.js`

## Code removed / obsolete cleanup

1. Removed dead search helper export:
   - Deleted `matchesSearchTokens` from `src/shared/search.js` (no call sites).

2. Removed dead single-use wrapper:
   - Deleted `sortCards` from `src/card-browser.js` (never referenced).

3. Removed duplicated card earn-rate fallback readers:
   - Deleted local `cardRate` implementations from:
     - `src/optimizer.js`
     - `src/card-browser.js`
   - Replaced with shared `readCardEarnRate` in `src/subcategory-config.js`.

## Reuse refactors and affected identifiers

### Shared search ranking consolidation
- Added `weightedSearchScore` to `src/shared/search.js` as the shared weighted matching heuristic.
- Updated the following to reuse this helper:
  - `rankCardMatches` in `src/shared/card-search.js`
  - `programMatches` in `src/app/actions.js`
  - `cardSearchScore` in `src/card-browser.js`

### Shared earn-rate read consolidation
- Added `readCardEarnRate` to `src/subcategory-config.js`.
- Updated usage in:
  - `src/optimizer.js` (`valuePerDollar`, and subcategory virtual-rate calculation)
  - `src/card-browser.js` (`merchantPortalEntriesForCard`)

## Data-contract/static correctness checks

Validated by static call-site review:
- Worker contract unchanged: message shape remains `{ requestId, payload }` in and `{ requestId, result|error }` out.
- Optimizer output structure unchanged (`combo`, `net`, `gross`, `fees`, `assigned`), preserving UI rendering expectations.
- Search ranking semantics preserved (same full + name-preference weighting), now centralized.
- Card rate fallback semantics preserved (category-specific earn rate, then `other`, then `0`), now centralized.

## In-place documentation updates

- Added file-level optimizer data-flow comment in `src/optimizer.js` to document non-obvious execution stages.
- Removed stale dead-code surface area by deleting obsolete helper functions noted above.

## Deferred follow-ups (intentionally out-of-scope for targeted cleanup)

1. Extracting additional optimizer internals (cap routing/combination pruning) into smaller shared/domain units was deferred to avoid structural reshaping.
2. Potential unification of card/program search indexing (cards vs. rewards programs) into one generic index builder was deferred to keep current module boundaries intact.
3. No behavioral/perf tuning of combo search strategy was attempted; this pass focused strictly on static QA cleanup and deduplication.
