# Marketing copy and ad creative export notes

## Paid social creative export workflow (`ad-creative.html`)

1. Start a local static server from the repository root.
   - `python3 -m http.server 4173`
2. Open `http://localhost:4173/ad-creative.html` in a desktop browser.
3. Keep browser zoom at **100%**.
4. Use each variant's **Export high-res PNG** button to download a 2160 × 2160 PNG export (2x scale from the 1080 × 1080 frame).
5. Optionally capture manually from the fixed 1080 × 1080 canvas frame if you need an exact viewport screenshot (no manual element repositioning needed).

### Exact framing checklist

- Confirm the full rounded 1080 × 1080 frame is visible and not clipped by browser UI.
- Capture or export **Variant A (light)** and **Variant B (dark)** separately.
- Prefer the in-page export button for the highest-resolution source file.
- Export PNG files to preserve text and UI edge quality.

### Recommended output sizes

- **Primary:** 1080 × 1080 (square feed) for upload.
  - Authoring export output from the template buttons is 2160 × 2160 for extra sharpness; downscale if needed before upload.
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
