# Budget App

A **customisable, offline-first budgeting PWA**, born from a hand-built Excel budget tracker.
Log transactions or import bank statements, and the dashboard, budget, debt and savings views fill themselves in — and anyone can shape the categories, accounts and pay cycle to their own life.

> Status: **first working version (v0.1).** Core screens, statement import and the PWA shell are built and tested. See [Roadmap](#roadmap).

## Features
- **Blank by default** – no categories, accounts or sample data; you build your own budget.
- **Custom budget period** – start day (e.g. pay day), optional move to previous/next working day, public-holiday calendar (South African preset included).
- **Budget** – groups (income / expense / debt / savings / transfer) and categories with a monthly amount, plus "left to allocate".
- **Dashboard** – period switcher, spent vs budget, pace check, over-budget and uncategorised warnings.
- **Transactions** – add / edit / search; remembers description → category for next time.
- **Statement import** – CSV from Discovery Bank, FNB, Capitec or any bank: preamble skipping, column mapping (remembered per layout), duplicate detection, per-row categorising.
- **Debt & Savings** – balances, interest/target, payoff and time-to-goal estimates driven by your budget.
- **History** – 12-period income vs spend.
- **Backup / restore** as JSON; installable and fully offline.

> Bank layouts are detected best-effort from column names. Please test with a real export from each bank and report any that need a tweak.

## Goals
- Replace the spreadsheet's formulas with a fast, installable app (see [`docs/SPREADSHEET-MAPPING.md`](docs/SPREADSHEET-MAPPING.md)).
- Import bank statements (CSV first, then OFX/XLSX) with saved column mappings and auto-categorisation.
- Fully customisable: categories & groups, accounts, pay-cycle day and holiday rules, currency, theme.
- Private by design: data stays on your device; works offline; export/import backups.
- Shareable: others start from a blank or template budget instead of yours.

## Planned tech stack (proposed, open to change)
| Concern        | Choice |
|----------------|--------|
| Build          | Vite + TypeScript |
| UI             | React |
| PWA            | `vite-plugin-pwa` (manifest + service worker) |
| Storage        | IndexedDB via Dexie |
| Import parsing | PapaParse (CSV), SheetJS (XLSX), custom OFX parser |
| Tests          | Vitest + Testing Library |

## Project structure
```
budget-app/
├── docs/                 Architecture + spreadsheet-to-app mapping
├── public/               Static assets and PWA icons
├── samples/              Your private statements (git-ignored)
├── scripts/              Dev scripts (e.g. xlsx → seed data)
├── src/
│   ├── app/              App shell, routing, providers
│   ├── db/               IndexedDB schema and repositories
│   ├── domain/           Pure budget/cycle/debt/savings logic
│   ├── features/         dashboard · transactions · budget · weekly · debt
│   │                     savings · history · import · settings · onboarding
│   ├── components/       Shared UI components
│   ├── hooks/  lib/  styles/  types/
│   └── main.tsx
└── tests/                unit tests and anonymised fixtures
```
Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Getting started
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # typecheck + production build (with service worker)
npm run preview    # serve the production build locally
```

## Roadmap
1. ✅ Foundation – scaffold, PWA shell, DB, settings
2. ✅ Core – transactions, budget, dashboard
3. ◑ Import – CSV done; OFX / XLSX and PDF still to do
4. ◑ Tracking – debt, savings, history done; dedicated weekly review still to do
5. ☐ Polish – transfers between accounts and balances, edit/split transactions in bulk, recurring items, charts, i18n

## Privacy
No servers, no accounts, no analytics. Personal files placed in `samples/` are git-ignored.
