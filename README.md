<p align="center">
  <img src="public/brand/certgen-pixel-96.png" width="72" height="72" alt="CertGen certificate and ribbon logo" />
</p>

# CertGen

### Your design. Your data. Certificates at scale.

A browser-based certificate studio that turns your PDF template and recipient spreadsheet into personalized, print-ready PDFs. Design fields visually, preview the actual output, and export a complete batch—without uploading your documents to a server.

[![Checks](https://github.com/SS-360/Cert-gen/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/SS-360/Cert-gen/actions/workflows/ci.yml)

**[Open CertGen →](https://certgen-ss-360.vercel.app)**

[Getting started](#getting-started) · [Workflow](#certificate-workflow) · [Privacy](#privacy-and-local-storage) · [Deployment](#build-and-deploy) · [Contributing](#contributing)

## Features

- **Bring your own PDF.** Preserve original vector artwork, pages, crop boxes, and rotation.
- **Place text precisely.** Draw, move, resize, and position fields with zoom-independent coordinates.
- **Browse real font samples.** Choose from 26 bundled typefaces and three standard PDF families, or upload a custom font.
- **Connect your own data.** Import CSV, TSV, or Excel; map columns, shared values, and sequential IDs.
- **Preview the actual output.** Design and export use the same PDF generation and rendering pipeline.
- **Generate complete batches.** Download individual PDFs in a ZIP, one combined PDF, and a row-by-row report.
- **Keep files local.** No account, backend, API key, runtime CDN, or file-upload service is required.

## Getting started

Requires **Node.js 24.x** and npm.

```sh
git clone https://github.com/SS-360/Cert-gen.git
cd Cert-gen
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. Choose **Open sample project** to explore a fictional template and three placeholder recipients, or upload your own PDF.

The old `index.production.html` URL redirects to the new app. Opening the source as a `file://` URL is no longer supported; use the development server or serve the production build.

## Certificate workflow

1. **Template:** upload an unlocked PDF (up to 25 MB). Original pages, vector artwork, page rotation, and crop boxes are preserved.
2. **Design fields:** draw, drag, or resize a box on any PDF page. Sample text appears inside the boxes in the selected font and colour. Set the font, style, size, colour, alignment, fit, and required status. Expand **Position & size** for precise coordinates, or use arrow keys to move a selected box. On a touch screen, use Add field and the numeric controls, or drag the boxes.
3. **Recipients:** import CSV, TSV, or the first worksheet of an Excel `.xlsx` file (up to 10 MB / 5,000 recipients). Quoted commas, embedded newlines, UTF-8 BOMs, and zero values are handled correctly. Map each field to a column, a shared value, or an auto-numbered certificate ID. Edit, search, and paginate the imported list.
4. **Review & export:** inspect an actual generated PDF for any recipient and page, then generate the batch. Download individual PDFs in a ZIP or one combined PDF. Each filename has a row number so duplicate names cannot overwrite one another.

Missing required values block the batch. Generation failures are reported with their row and reason; no failed certificates are silently counted as successes. Stopping generation retains completed PDFs. The ZIP includes a CSV report with Generated, Failed, or Not processed status for every recipient.

Newly drawn, added, and duplicated fields start **unnamed**. Enter your own label in Text properties before continuing. There is no mandatory spreadsheet schema; **Sample CSV** downloads an example based on your current mappings.

| Data source | Use it for |
| --- | --- |
| Spreadsheet column | Values that vary by recipient |
| Same for everyone | A shared program name, date, or other common value |
| Sequential ID | A configurable prefix and numbered certificate identifier |

> Sequential IDs are formatting identifiers, not digitally signed credentials or an online verification service. Use a distinct prefix or starting number for separate batches when global uniqueness matters.

## Fonts and languages

Click **Font** to open a searchable, visual typeface library. Each row shows your sample text in the real font. Filter by sans serif, serif, cursive, handwriting, display, monospace, or Tamil. The library contains **26 bundled typefaces / 52 real font files**, plus the three standard PDF families Helvetica, Times Roman, and Courier. The Style menu offers only variants actually available for the selected typeface: regular, bold, italic, or bold italic. PDF exports embed the same font files used by the editor. Font files load locally on demand, with no Google Fonts or runtime CDN calls.

Noto Sans supports Latin, Greek, and Cyrillic. Noto Sans Tamil is included for Tamil. You can also upload a compatible `.ttf` or `.otf` font (up to 8 MB); it is selected immediately and remains available in the font browser for this session. A font must contain all required characters; unsupported characters produce an actionable error. Review the real PDF preview for script shaping and your specific font before generating the whole batch.

**Sample text** never replaces recipient names, mapped columns, shared values, or certificate IDs in exported PDFs. The design canvas generates an actual PDF using the same font embedding, auto-fit, line metrics, alignment and baseline calculations as export; there is no separate HTML lettering approximation. When sample text matches recipient data, both canvases render the same pixels at the same viewport width and zoom. Without a custom sample override, the design canvas uses the recipient last selected in Review & export. Turn off **Show sample text** to inspect the original template.

The **Zoom** controls in Design fields and Review & export stay linked. They affect only on-screen magnification, never the stored font size or field positions. A live status reports when the PDF preview is updating or when text cannot fit/render; no approximate HTML fallback hides an export error. Rapid edits discard superseded renders before displaying the latest result.

## Text colour

Click the colour swatch for a hue/saturation wheel, brightness slider, exact hue/saturation values, hex input, presets, and the system colour picker. Drag the wheel, or use Left/Right for hue and Up/Down for saturation. Three- and six-digit hex colours are accepted. All controls update the selected field immediately.

**Pick from screen** uses the browser's EyeDropper API on compatible browsers and secure origins (including localhost). Cancelling leaves the previous colour unchanged. If unavailable, the wheel, hex input, and system picker still work. The chosen colour is saved in layouts and used in exported PDFs.

## Privacy and local storage

**The application does not upload your PDFs, spreadsheets, custom fonts, or generated certificates.** Processing happens on the user's device.

| Content | Storage behaviour |
| --- | --- |
| Active PDF, recipient list, and generated output | In memory for the current page session |
| Explicitly saved template | IndexedDB in the current browser profile and origin |
| Saved template contents | Original PDF, field settings, mappings, shared values, and required custom font |
| Recipient rows and sample-text overrides | Not included in saved templates |
| Downloads | Written to the user's chosen download location |

**Save layout** stores the original PDF, field settings, mappings, shared values, and any required custom font in **IndexedDB in this browser only**. Recipient lists, generated certificates, and sample-text overrides are not saved. Saving the same PDF replaces its previous saved version. **Load layout** lists local templates and provides Restore and Delete controls. Existing JSON layouts can still be imported after uploading their original PDF; fingerprints prevent using the wrong template.

Nothing is silently persisted. Refreshing clears the in-memory project; explicitly saved templates remain in this browser profile on this origin. They never sync to another domain, browser, device, account, or server. Clearing site data, private browsing, quota eviction, or uninstalling a browser can remove them. Keep original files. Anyone using the same browser profile can access saved templates. Import recipients again after restoring a template.

Localhost and the deployed website have separate storage. The optional sample project uses fictional placeholder content and never modifies uploaded templates. Local storage is not encrypted or a backup service.

## Build and deploy

```sh
npm run build
npm run preview
```

Publish the `dist/` directory on any static host. No backend, API key, database, or runtime CDN is required. The PDF worker, CMaps, standard-font data, and WASM decoders are bundled locally. The heavier PDF, font, ZIP, and Excel modules load only when needed.

### Vercel

Import **SS-360/Cert-gen** into your Vercel team using these settings:

| Setting | Value |
| --- | --- |
| Production branch | `master` |
| Root directory | Repository root |
| Framework preset | Vite |
| Node.js | 24.x |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | None required |

`vercel.json` supplies the build settings and security headers, including a same-origin Content Security Policy. No serverless functions, analytics SDK, database, or file-upload endpoints are included. Verify that the production URL is accessible without signing in if the application is intended for public use.

The application sends no uploaded file contents to a server. A static hosting provider still receives ordinary asset requests and may retain access logs (for example IP address, browser, and URL). Local storage is not encrypted and is not a backup service.

The app makes same-origin requests for its own assets. It does not send recipient data to third parties. Imported files are still untrusted: only process files you are permitted to use. PDF templates must be unlocked and editable.

## Limits and browser support

| Input | Limit |
| --- | --- |
| PDF template | 25 MB; unlocked/editable PDFs |
| Recipient file | 10 MB; CSV, TSV, or Excel `.xlsx` |
| Recipients | 5,000 per batch |
| Fields | 100 per template |
| Custom font | 8 MB; TTF or OTF |

Generation uses local CPU and memory. Large templates, many pages, or complex fonts can slow a batch; use smaller batches on memory-constrained devices.

Automated browser coverage targets Chromium, desktop and mobile-sized layouts, and high-DPI rendering. Firefox and Safari have not been independently verified. Native OS colour dialogs and permission prompts require manual testing.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Core tests cover CSV edge cases, validation, safe filenames, text fitting, every bundled font/style, colour conversion, layout compatibility, shared zoom geometry, and multi-page / rotated / cropped PDFs. Browser tests also compare the design/export canvas pixels and displayed dimensions directly for cursive, standard serif bold, bold italic, alignment, multiline auto-fit, linked zoom, cropped/rotated pages and mobile at DPR 2. Set `CERTGEN_QA_TEMPLATE` to a local PDF to run the portrait comparison against your own certificate instead of the generated fixture. Other checks cover font search/categories/style previews, sample-only text isolation, embedded fonts and exact PDF colours, wheel/hex/native-picker synchronization, a mocked EyeDropper API, imports, real ZIP/PDF downloads, a 100-recipient batch, cancellation, and a 390 px mobile viewport. Native OS colour dialogs and screen capture prompts require manual browser interaction; tests cover the app's event/API integration rather than those OS interfaces.

GitHub Actions runs core tests, the production build, Chromium workflows, and a separate production-security-policy smoke test on pushes and pull requests. Browser coverage also checks unnamed fields, browser-only template save/restore/delete, and isolation between browser profiles.

## Project structure

- `src/main.js` — four-step workflow, editor interactions, preview, export
- `src/lib/data.js` — spreadsheet parsing, mappings, row validation, filenames
- `src/lib/layout.js` — normalized field geometry and layout validation
- `src/lib/pdf.js` — vector PDF generation, font embedding, rotation transforms
- `src/lib/fonts.js`, `font-loader.js` — font catalogue and lazy local FontFace/PDF loading
- `src/editor-controls.js`, `src/lib/color.js` — visual font browser and accessible colour controls
- `src/lib/pdf-preview.js` — shared PDF canvas rendering and zoom geometry
- `src/lib/template-store.js` — browser-only IndexedDB storage
- `src/styles.css` — responsive interface
- `public/fonts/` — bundled open-source fonts and per-family licences
- `scripts/download-fonts.mjs` — repeatable download of official font sources (not needed to build/run)
- `public/brand/` — generated pixel certificate emblem and favicon
- `tests/` — core and browser regression tests

## Troubleshooting

| Issue | What to check |
| --- | --- |
| Missing or incorrect characters | Choose a font with the required glyphs; upload a compatible font and inspect the PDF preview. |
| Text does not fit | Enable auto-fit, enlarge the box, or reduce the maximum font size. |
| Cannot continue to recipients | Name every field in Text properties. |
| Saved template is missing | Check the browser profile and exact domain. Private browsing and cleared site data do not preserve local saves. |
| Save fails | Check available browser storage and privacy settings; keep the original files. |
| Required values are empty | Check the field's source, mapped column, or shared value. |
| App does not run from a local file | Start `npm run dev` or serve the built `dist/` directory. |

## Contributing

Use fictional fixtures, keep runtime assets same-origin, and preserve local-only processing. Add regression tests for behaviour changes and run the checks above before submitting a pull request. Never commit private documents, recipient lists, credentials, or `.vercel` configuration.

## Licence

The application declares the **MIT** licence in `package.json`. Third-party fonts and dependencies retain their own licences; font notices are included in `public/fonts/` and `public/fonts/licenses/`.
