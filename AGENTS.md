# AGENTS.md

This file defines contribution instructions for all agent work in this repository.

## Scope
These rules apply to the entire repository unless a deeper `AGENTS.md` overrides them.

## Contribution rules
1. **Update docs only for significant changes.**
   - Update `REPOSITORY_DOCUMENTATION.md` only when the change is significant enough that, if it had been made previously, it would already have warranted inclusion there.
   - Update `README.md` only for significant user-facing or setup-relevant changes that meet the same bar.
   - Keep `README.md` minimal and high-level; put detailed material in `REPOSITORY_DOCUMENTATION.md`.

2. **Card/program data quality and research workflow are mandatory.**
   - Follow the exact schema and field conventions of the relevant JSON files when adding or editing cards/programs.
   - Validate that keys, value types, naming patterns, and structure are consistent with existing entries.
   - When adding new cards, research in **batches of 10 cards at a time**.
   - Use official sources for each card’s earn rates and rules whenever possible.
   - Before finalizing, present the researched cards to the human operator, including each card’s computed **effective percent earn rate**:
     - `effective_percent_earn_rate = earn_multiplier * estimated_point_value`

3. **Minimize bloat and maximize reuse.**
   - Prefer existing functions, utilities, components, styles, and patterns over introducing new abstractions.
   - Keep changes focused and minimal.
   - Avoid duplicate logic and unnecessary new dependencies.

4. **Keep wording country-agnostic for future expansion.**
   - Prefer country-neutral wording in functionality, UI copy, and docs whenever possible.
   - Avoid hardcoding country-specific assumptions unless they are required by current data or logic.

5. **Favor elegant and obvious code, and explain non-obvious intent.**
   - Always aim for the most elegant and obvious implementation.
   - If a contribution requires code whose purpose or intent is not obvious (for example, a workaround for a bizarre or unpredictable bug), add an inline comment that explains why the code exists.

## Implementation guidance for agents
- Make small, reviewable commits.
- Preserve existing coding style and naming patterns.
- Include brief rationale in PR descriptions when making tradeoffs.
