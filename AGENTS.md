# Repository Guidelines

## Project Structure & Module Organization
- `data/raw/` holds uploaded CSV snapshots named `stock-items_MM_DD_YYYY.csv` (e.g. `stock-items_09_30_2025.csv`).
- `data/snapshots/` stores processed JSON snapshots keyed by ISO date plus upload timestamp.
- `inventory/` contains the GitHub Pages subsite (Svelte + Vite app) with source under `inventory/src/` and static assets in `inventory/public/`.
- `scripts/` hosts Node+TypeScript utilities such as `processSnapshots.ts` that convert raw CSV files into JSON artifacts and diffs.

## Build, Test, and Development Commands
- `npm run build-data` — parse raw CSV files, update `data/snapshots/`, and refresh aggregated indexes.
- `npm run dev` (in `inventory/`) — launch the Vite dev server for the inventory dashboard.
- `npm run build` — produce the static site for GitHub Pages deployment into `inventory/dist/`.

## Coding Style & Naming Conventions
- Use TypeScript with 2-space indentation; prefer named exports for shared modules.
- Keep file names kebab-case (`inventory/src/components/item-history.svelte`).
- Derive snapshot JSON filenames as `YYYY-MM-DDTHHMMZ.json`; always capture `uploadedAt` alongside `snapshotDate`.
- Run `npm run lint` before committing; the project uses ESLint + Prettier defaults tailored for Svelte.

## Testing Guidelines
- Write component and utility tests with Vitest; place them next to sources as `*.test.ts` or `*.spec.ts`.
- Cover CSV parsing edge cases (missing quantities, duplicated names) and UI regression cases with Playwright smoke tests (`tests/e2e/`).
- Maintain >85% coverage for processing utilities; run `npm run test -- --coverage` locally before PRs.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat: add snapshot diff table`, `fix: handle blank unit`); summarize scope in 72 characters or fewer.
- Each PR should describe data or UI changes, include relevant screenshots for UI updates, and link to tracking issues.
- Ensure CI passes build, lint, and test jobs. Rebase on `main` before requesting review to avoid stale snapshot data.

## Snapshot Processing Workflow
- When adding a CSV, drop it into `data/raw/` and run `npm run build-data` to regenerate artifacts.
- The processor compares each snapshot to the latest upload for the same `snapshotDate`; older same-day uploads remain in history charts.
- Review generated diffs in `data/index.json` and commit both raw CSV and derived JSON together for traceability.