# Repository Guidelines

## Project Structure & Module Organization
- `data/raw/` stores uploaded CSV snapshots named `stock-items_MM_DD_YYYY.csv`.
- `data/snapshots/` and `data/reports/` hold generated JSON payloads and change reports; matching copies live under `inventory/public/data/` for the GitHub Pages build.
- `inventory/` contains the Svelte + Vite subsite (`inventory/src/` for code, `inventory/public/` for static assets).
- `scripts/` hosts Node+TypeScript tooling (`processSnapshots.ts`) that parses CSV input, produces snapshots, and computes diff metadata.

## Build, Test, and Development Commands
- `npm run build-data` - parse raw CSV files, refresh snapshots, reports, and update `latest*.json` artifacts.
- `npm run dev` (inside `inventory/`) - launch the dashboard locally with hot reload.
- `npm run build` (inside `inventory/`) - generate the production bundle in `inventory/dist/` for GitHub Pages.

## Coding Style & Naming Conventions
- TypeScript with 2-space indentation; prefer named exports for shared modules.
- Use kebab-case for Svelte files (`inventory/src/components/change-highlights.svelte`).
- Snapshot filenames follow `YYYY-MM-DD_<timestamp>.json`; reports mirror the snapshot name in `data/reports/`.
- Lint with ESLint + Prettier before committing (`npm run lint`).

## Testing Guidelines
- Unit-test parsers and utilities with Vitest (`*.test.ts` next to sources).
- Cover UI flows with Playwright smoke tests in `tests/e2e/`.
- Target =85% coverage on data-processing scripts; run `npm run test -- --coverage` ahead of PRs.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat: add change highlights panel`, `fix: guard csv export`). Keep subject =72 characters.
- Document PR intent, attach screenshots for UI updates, and link tracking issues.
- Confirm CI passes build, lint, and tests; rebase on `main` to avoid regenerating stale snapshot files.

## Snapshot Processing Workflow
- Drop new CSVs into `data/raw/` and run `npm run build-data`; the script clears derived folders, rebuilds snapshots, and emits `latest.json` plus `latest-report.json`.
- Compare change reports in `data/reports/` and `inventory/public/data/reports/` to review increases, decreases, and new items.
- Commit raw CSVs alongside generated artifacts for traceability across deployments.
