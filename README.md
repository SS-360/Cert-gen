# CertGen — Bulk Certificate Studio

Create personalized certificates from your own PDF template and a CSV or Excel recipient list. Everything runs in your browser: PDF templates, spreadsheets, and custom fonts are never uploaded to an API.

## Run locally

Requires Node.js 22.13+ (Node.js 24 recommended).

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. Use **Open sample project** to try a complete AAACET certificate and three sample recipients.

The old `index.production.html` URL redirects to the new app. Opening the source as a `file://` URL is no longer supported; use the development server or serve the production build.

## Certificate workflow

1. **Template:** upload an unlocked PDF (up to 25 MB). Original pages, vector artwork, page rotation, and crop boxes are preserved.
2. **Design fields:** draw, drag, or resize a box on any PDF page. Set each field's font, size, colour, alignment, auto-fit, and required status. Use the position inputs or arrow keys for precise placement. On a touch screen, use Add field and the numeric controls, or drag the boxes.
3. **Recipients:** import CSV, TSV, or the first worksheet of an Excel `.xlsx` file (up to 10 MB / 5,000 recipients). Quoted commas, embedded newlines, UTF-8 BOMs, and zero values are handled correctly. Map each field to a column, a shared value, or an auto-numbered certificate ID. Edit, search, and paginate the imported list.
4. **Preview & export:** inspect an actual generated PDF for any recipient and page, then generate the batch. Download individual PDFs in a ZIP or one combined PDF. Each filename has a row number so duplicate names cannot overwrite one another.

Missing required values block the batch. Generation failures are reported with their row and reason; no failed certificates are silently counted as successes. Stopping generation retains completed PDFs. The ZIP includes a CSV report with Generated, Failed, or Not processed status for every recipient.

## Fonts and languages

Noto Sans is bundled and embedded in the PDFs. It supports Latin, Greek, and Cyrillic text. Helvetica, Times Roman, and Courier are also available.

For Tamil or another script, upload a compatible `.ttf` or `.otf` font and choose **Custom** on the affected fields. A font must contain all required characters; unsupported characters produce an actionable error. Review the real PDF preview for script shaping and your specific font before generating the whole batch. Custom fonts are used only in this browser session.

## Reuse a layout

Save layout downloads a small JSON configuration with field coordinates, styles, and column mappings. It does not contain recipient data, the template, or font files. To restore it, upload the same PDF and load the JSON. The app checks a SHA-256 fingerprint to prevent applying positions to the wrong template. Re-upload a custom font if the layout used one.

Nothing is silently persisted: refreshing the page clears the in-memory project. Save the layout before leaving.

## Build and host

```sh
npm run build
npm run preview
```

Publish the `dist/` directory on any static host. No backend, API key, database, or runtime CDN is required. The PDF worker, CMaps, standard-font data, and WASM decoders are bundled locally. The heavier PDF, font, ZIP, and Excel modules load only when needed.

The app makes same-origin requests for its own assets. It does not send recipient data to third parties. Imported files are still untrusted: only process files you are permitted to use. PDF templates must be unlocked and editable.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Core tests cover CSV edge cases, validation, safe filenames, text fitting, font errors, layout validation, and multi-page / rotated / cropped PDFs. Browser tests exercise imports, real preview text, actual ZIP/PDF downloads, a 100-recipient batch, cancellation, and a 390 px mobile viewport.

GitHub Actions runs the core tests, production build, and Chromium workflow checks on pushes and pull requests.

## Project structure

- `src/main.js` — four-step workflow, editor interactions, preview, export
- `src/lib/data.js` — spreadsheet parsing, mappings, row validation, filenames
- `src/lib/layout.js` — normalized field geometry and layout validation
- `src/lib/pdf.js` — vector PDF generation, font embedding, rotation transforms
- `src/styles.css` — responsive interface
- `public/fonts/` — Noto Sans and its SIL Open Font License
- `tests/` — core and browser regression tests

MIT. Third-party fonts and dependencies retain their respective licenses.
