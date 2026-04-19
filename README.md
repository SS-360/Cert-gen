# CertGen - Bulk Certificate Generator

A web-based tool for generating bulk certificates from PDF templates. Mark fill areas once, upload your data, and generate hundreds of personalized certificates instantly.

## Features

- **PDF Template Upload** - Upload any PDF certificate template
- **Visual Area Selection** - Click and drag to mark fill areas directly on the PDF
- **Bulk Data Input** - Upload CSV files with recipient data or enter manually
- **Common Values** - Set values that apply to all certificates (e.g., course name, date)
- **Font Customization** - Adjust font size, color, and alignment
- **Auto-fit Text** - Automatically adjusts font size to fit within marked areas
- **Bulk Download** - Download all generated certificates as a ZIP file
- **No Server Required** - Runs entirely in the browser, no data leaves your device

## Usage

1. **Upload Template** - Drag & drop or select a PDF certificate template
2. **Mark Fill Areas** - Draw rectangles where you want text to appear (name, date, etc.)
3. **Add Data** - Upload a CSV or manually enter recipient information
4. **Generate** - Preview and download all certificates as a ZIP

## CSV Format

Your CSV should have columns matching your field names:

```csv
name,course,date
John Smith,Web Development,2024-01-15
Jane Doe,Data Science,2024-01-15
```

## Tech Stack

- **PDF.js** - PDF rendering
- **pdf-lib** - PDF generation
- **JSZip** - ZIP file creation
- **Tailwind CSS** - Styling

## Running Locally

Just open `index.production.html` in a browser. No build step or server required.

```bash
# Clone the repo
git clone https://github.com/SS-360/Cert-gen.git

# Open in browser
open index.production.html
```

## License

MIT