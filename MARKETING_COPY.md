# Marketing copy and ad creative export notes

## Paid social creative export workflow (`ad-creative.html`)

1. Start a local static server from the repository root.
   - `python3 -m http.server 4173`
2. Open `http://localhost:4173/ad-creative.html` in a desktop browser.
3. Keep browser zoom at **100%**.
4. Click each variant's **Export high-res PNG** button to generate a PNG download directly from the 1080 × 1080 canvas (no manual element repositioning needed).

### Exact framing checklist

- Confirm the full rounded 1080 × 1080 frame is visible and not clipped by browser UI.
- Export **Variant A (light)** and **Variant B (dark)** separately using their buttons.
- Keep the canvas fully visible before export so any browser-specific font rendering preview matches the saved image.
- PNG exports are generated at 2× scale for crisp paid-social uploads.

### Recommended output sizes

- **Primary:** 1080 × 1080 (square feed).
- **Optional landscape test:** 1200 × 628.
  - For landscape tests, crop from the square source while keeping headline, dashboard panel, and CTA fully readable.

### Quality + compliance checklist

- Legibility is still strong when previewed at small feed sizes.
- Contrast remains strong between text, panel surfaces, and background treatment.
- No trademarked card art or issuer logos are included.
- No guaranteed-outcome claims are used (keep value language directional and transparent).

## Local preview helper

Use this one-liner to start a local preview server when preparing captures:

- `python3 -m http.server 4173`

Then open:

- `http://localhost:4173/ad-creative.html`
