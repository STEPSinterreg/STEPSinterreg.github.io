# STEPSinterreg.github.io

This repository contains a Vite + React application for GitHub Pages.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm test
npm run build
```

## GitHub Pages deployment

GitHub Pages must publish the built static site from `dist/`. It does not run the Vite dev server and it does not compile `src/main.tsx` from the repository root.

Recommended setup:

1. In GitHub, open `Settings -> Pages`.
2. Set `Source` to `GitHub Actions`.
3. Push to `main`.
4. The workflow in `.github/workflows/deploy-pages.yml` will build the app and publish `dist/`.

### Base path rules

- If the repository is the user or organization site, for example `<owner>.github.io`, the site base should be `/`.
- If the repository is a project site, for example `<owner>.github.io/<repo>/`, the site base should be `/<repo>/`.

The workflow computes that automatically before building.

## Optional local deploy into another Pages repo

If you still want to copy the built site into a separate checked-out Pages repository on your machine:

```bash
npm run deploy:pages:local -- "C:/path/to/your/pages-repo"
```