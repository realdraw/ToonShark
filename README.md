<p align="center">
  <img src="build/ToonShark.svg" width="128" height="128" alt="ToonShark logo">
</p>

<h1 align="center">ToonShark</h1>

<p align="center">
  A desktop tool that slices webtoon images from PDF and exports them to match each platform's requirements.
</p>

<p align="center">
  <a href="https://github.com/realdraw/ToonShark/actions/workflows/ci.yml"><img src="https://github.com/realdraw/ToonShark/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/realdraw/ToonShark/releases/latest"><img src="https://img.shields.io/github/v/release/realdraw/ToonShark?include_prereleases" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/macOS-supported-brightgreen" alt="macOS">
  <img src="https://img.shields.io/badge/Windows-supported-brightgreen" alt="Windows">
</p>

<p align="center">
  <a href="README_ko.md">한국어</a>
</p>

---

## What It Does

ToonShark takes a webtoon PDF, splits it into individual image slices, and exports them in the exact width, format, and file-size limits each publishing platform requires — so you don't have to do it by hand.

### Core workflow

1. **Open a PDF** — drag-and-drop or file picker
2. **Slice** — choose Auto (white-margin detection) or Fixed (uniform height) mode
3. **Preview** — check results on simulated device viewports (iPhone, Galaxy, etc.)
4. **Export** — batch-export to multiple platforms at once (Ridi, Alltoon, WATCHA, ...)
5. **Thumbnail** — crop any slice to generate platform-spec thumbnails

### Key features

- **Auto slice** — detects cut boundaries by analyzing white margins between panels
- **Fixed slice** — mechanically splits at a uniform pixel height
- **Multi-PDF workspace** — open and process multiple PDFs in tabs
- **Device preview** — pixel-accurate preview with customizable device presets
- **Platform export** — resize, convert format (PNG/JPG), and enforce max file-size per platform
- **Thumbnail capture** — crop a region from any slice and export as a platform thumbnail
- **Configurable presets** — device list and country/platform specs are JSON files you can edit or import/export
- **Dark / Light / System theme**
- **English & Korean UI**

## Download

Pre-built installers are available on the [Releases](https://github.com/realdraw/ToonShark/releases) page.

| OS | Format |
|----|--------|
| macOS (Apple Silicon & Intel) | `.dmg` |
| Windows x64 | `.exe` (NSIS installer) |

## Build from Source

### Prerequisites

- **Node.js** >= 24
- **npm** >= 11

### Install & run

```bash
git clone https://github.com/user/toonshark.git
cd toonshark
npm install
npm run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode |
| `npm run build` | Build renderer & main process |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run end-to-end tests (Playwright + Electron) |
| `npm run dist:mac` | Package for macOS (.dmg) |
| `npm run dist:win` | Package for Windows (.exe) |

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Electron 41 |
| Frontend | React 19, React Router 7, Zustand 5 |
| Styling | Tailwind CSS 4 |
| Build | electron-vite, Vite 7 |
| Image processing | Sharp, @napi-rs/canvas |
| PDF rendering | pdfjs-dist |
| Testing | Vitest, Playwright, Testing Library |
| Language | TypeScript 5 |

## Project Structure

```
src/
├── main/             # Electron main process
│   ├── ipc/          # IPC handler registration
│   └── services/     # Core services (slice, export, PDF, settings, …)
├── preload/          # Context bridge (renderer ↔ main)
├── renderer/         # React frontend
│   └── src/
│       ├── app/      # App root & routing
│       ├── components/
│       ├── hooks/
│       ├── i18n/     # en / ko translations
│       ├── pages/
│       └── stores/   # Zustand stores
├── shared/           # Types & constants shared across processes
resources/
└── defaults/         # Default device presets & platform specs (JSON)
```

## Platform Presets

Platform export specs live in `resources/defaults/countries.json`. You can add or modify platforms by editing this file or using the in-app import/export feature.

Each platform defines:
- **Episode spec** — target width, image format (png/jpg), max file size
- **Thumbnail spec** (optional) — width, height, format, max file size

## Documentation

- [User Manual (English)](docs/manual_en.md)
- [사용 매뉴얼 (한국어)](docs/manual_ko.md)

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## Credits

- [beni](https://github.com/sejoung) — Creator & maintainer
- **bela** — Named this project "ToonShark"
- Everyone at **REALDRAW** who shared ideas and enthusiasm during the naming process

## License

Copyright 2026 REALDRAW Inc.

Apache License 2.0 — see [LICENSE](LICENSE) for details.
