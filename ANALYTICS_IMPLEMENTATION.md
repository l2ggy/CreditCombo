# Analytics Implementation (GA4)

This repository uses GA4 Measurement ID `G-F85DCJP3CW` with a shared tracking helper (`src/shared/analytics.js`) and semantic events across major user flows.

## Event dictionary

| Event | Trigger location | Key params | Purpose |
|---|---|---|---|
| `page_view` | `src/app.js`, `src/quick-setup.js`, `src/card-browser.js`, `valuations.html` | `page_type`, `page_path`, `timestamp_ms` | Core page behavior baseline. |
| `session_started` | Same entry points as `page_view` | `entry_path`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, click IDs (`gclid`, `fbclid`, `ttclid`, `msclkid`), `acquisition_channel` | Acquisition attribution and landing analysis. |
| `optimizer_view_loaded` | `src/app/actions.js` (`syncInitialUi`) | `page_type`, `page_path` | Optimizer entry quality signal. |
| `optimizer_manual_run_requested` | `src/app/actions.js` (`runOptimization` manual path) | metadata | Conversion-intent signal. |
| `optimizer_run_completed` | `src/app/actions.js` (cache/worker success) | `result_source`, `card_count`, `net_value` | Completion and quality outcome tracking. |
| `optimizer_run_failed` | `src/app/actions.js` (worker error path) | `error_message` | Reliability monitoring. |
| `optimizer_no_result_reason` | `src/app/actions.js` (no eligible/no cards/no spend paths) | `no_result_reason` | Funnel drop-off diagnosis. |
| `optimizer_setting_changed` | `src/app/actions.js` (k/valuation/fee/include-business/cashback) | `setting_name`, `setting_value` | Behavior and preference analysis. |
| `locked_card_added` / `locked_card_removed` | `src/app/actions.js` | `card_id` | Intent and engagement with owned-card mode. |
| `excluded_program_added` / `excluded_program_removed` | `src/app/actions.js` | `program_id` | Preference and friction analysis. |
| `advanced_preferences_reset` | `src/app/actions.js` | metadata | Friction reset indicator. |
| `optimizer_share_overlay_open` | `src/app/actions.js` (`openShareOverlay`) | metadata | Share intent (optimizer). |
| `optimizer_share_success` | `src/app.js` via share overlay callbacks | `method` | Successful share conversion signal. |
| `quick_setup_started` | `src/quick-setup.js` (`main`) | metadata | Funnel entry for guided flow. |
| `quick_setup_step_viewed` | `src/quick-setup.js` (`renderWizard`) | `step_key`, `step_index` | Step-level drop-off mapping. |
| `quick_setup_step_completed` | `src/quick-setup.js` (`goNext`) | `step_key`, `step_index` | Step completion progression. |
| `quick_setup_completed` | `src/quick-setup.js` (`goNext` final step) | `mode` | Funnel completion signal. |
| `quick_setup_open_optimizer_clicked` | `src/quick-setup.js` (results action) | `mode` | Guided-to-optimizer conversion signal. |
| `quick_setup_edit_answers_clicked` | `src/quick-setup.js` (results action) | `mode` | Rework/friction signal. |
| `quick_setup_retry_clicked` | `src/quick-setup.js` (init error retry) | metadata | Availability and recovery tracking. |
| `quick_setup_share_clicked` | `src/quick-setup.js` share handlers | `source` | Share intent/success signals in quick setup. |
| `card_browser_view_loaded` | `src/card-browser.js` (`init`) | `total_cards` | Entry baseline for browse surface. |
| `card_browser_filter_changed` | `src/card-browser.js` filter handlers | `filter_name`, `value` | Behavior exploration on browse surface. |
| `card_browser_sort_changed` | `src/card-browser.js` sort handlers | `sort_by`, `earn_category` | Ranking preference analysis. |
| `card_browser_reset_filters` | `src/card-browser.js` reset button | metadata | Friction recovery signal. |
| `card_browser_results_rendered` | `src/card-browser.js` (`renderCards`) | `result_count` | Downstream effect of filters/sort/search. |
| `card_official_link_clicked` | delegated click handlers in `src/card-browser.js`, `src/app/actions.js`, and `src/quick-setup.js` | `issuer`, `card_name`, `program`, `surface`, `position` | Outbound conversion-intent and CTR measurement across browser and results surfaces. |

All events also include common metadata from the helper:
- `page_type`
- `page_path`
- `timestamp_ms`

## GA custom dimensions and metrics mapping

Recommended GA4 event-scoped custom dimensions:
- `page_type`
- `entry_path`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `gclid`
- `fbclid`
- `ttclid`
- `msclkid`
- `acquisition_channel`
- `no_result_reason`
- `setting_name`
- `setting_value`
- `step_key`
- `mode`
- `result_source`
- `issuer`
- `card_name`
- `program`
- `surface`
- `method`

Recommended GA4 custom metrics:
- `result_count`
- `card_count`
- `net_value`
- `position`
- `step_index`

## Troubleshooting

### CSP issues
- CSP is configured in `src/worker.js`.
- Required domains:
  - `script-src`: `https://www.googletagmanager.com`
  - `connect-src`: `https://www.google-analytics.com`, `https://region1.google-analytics.com`
  - `img-src`: `https://www.google-analytics.com`
- If events fail, verify response headers include these values.

### GA4 DebugView checks
1. Open site with GA DebugView active (e.g. GA Debugger extension or GTM preview-like debug mode).
2. Temporarily disable ad blockers/privacy extensions for your test domain; many block GA transport and make DebugView look empty.
3. Confirm a single `session_started` + `page_view` per page load.
4. Trigger one interaction and verify one corresponding semantic event.

### Duplicate event checks
- `quick_setup_step_viewed` is guarded by a last-viewed step signature to avoid duplicate emissions during rerenders.
- Optimizer emits events at semantic actions only (manual run, completion/failure/no-result), not raw typing.

## Extension pattern

To add new events cleanly:
1. Add event call using `trackEvent("event_name", { ...params })` in semantic action handlers.
2. Reuse existing state/DOM context (avoid new global trackers unless needed).
3. Keep parameter names snake_case and stable.
4. Add the new event to this dictionary and register corresponding custom dimensions/metrics in GA4 Admin.
