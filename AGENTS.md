# AGENTS.md

This file defines contribution instructions for all agent work in this repository.

## Scope
These rules apply to the entire repository unless a deeper `AGENTS.md` overrides them.

## Contribution rules
1. **Keep docs in sync with every feature change.**
   - Any feature addition or behavior change must be documented in `REPOSITORY_DOCUMENTATION.md`.
   - If the change is user-facing or setup-relevant, also update `README.md`.
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

## Implementation guidance for agents
- Make small, reviewable commits.
- Preserve existing coding style and naming patterns.
- Include brief rationale in PR descriptions when making tradeoffs.
