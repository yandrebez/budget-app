# Budget App

A **customisable, offline-first budgeting PWA**, born from a hand-built Excel budget tracker.
Log transactions or import bank statements, and the dashboard, budget, debt and savings views fill themselves in — and anyone can shape the categories, accounts and pay cycle to their own life.

> Status: **first working version (v0.1).** Core screens, statement import and the PWA shell are built and tested. See [Roadmap](#roadmap).

## Features
- **Blank by default** – no categories, accounts or sample data; you build your own budget.
- **Custom budget period** – start day (e.g. pay day), optional move to previous/next working day, public-holiday calendar (South African preset included).
- **Budget** – groups (income / expense / debt / savings / transfer) and categories with a monthly amount, plus "left to allocate".
- **Balance bar** – always at the top: this month's running balance and your overall balance (spending accounts; savings accounts are shown separately), with a per-account breakdown on tap.
- **Move money** – record transfers between your own accounts (e.g. leftover into savings) as linked transactions that don't count as spending; **Match to bank balance** reconciles an account's starting balance with what your bank shows.
- **Forecast** – "will I make it to the end of the month, and can I save?" A day-by-day projection of your spending-account balance to the end of the period with a likely range, a verdict (on track / tight / may run short), how much you could save now, a safe daily spend, the bills still to come (learned from your earlier periods and switchable), categories heading over budget, and a what-if panel.
- **Home** – left to spend, pace check, what needs attention, and every category with how much is used and left.
- **Activity** – transactions kept separate per account or card (with each account's balance), grouped by day; add / edit / search; remembers description → category.
- **Statement import** – CSV or PDF from Discovery Bank, FNB, Capitec or any bank: preamble skipping, column mapping (remembered per layout), duplicate detection, per-row categorising. PDFs are read on-device (password-protected ones supported); scanned/image PDFs are not.
- **Excel import for any workbook** – upload an existing `.xlsx` tracker. Tables are found by how they look (not by sheet names or position), classified by their headings and data, and combined when repeated (e.g. one tab per month). Handles bank fees, running-balance columns (used for opening balances), account types, savings goals, pay periods and holidays. Anything it can't tell, you can point at and map yourself. Preview first, safe to repeat without duplicates.
- **Debt & Savings** – balances, interest/target, payoff and time-to-goal estimates driven by your budget.
- **Stats** – a monthly summary (spent, in, saved, left over, where it went) plus a chart builder: columns, stacked, line or ranked bars; choose what to show, how to break it down, the range and account/category filters; every chart has a table view.
- **Backup / restore** as JSON; installable and fully offline.

> Bank layouts (CSV and PDF) are detected best-effort. Please test with a real statement from each bank and report any that need a tweak.

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
│   ├── domain/           Pure budget/cycle/balance/stats/debt/savings logic
│   ├── features/         dashboard · transactions · budget · stats · more · debt
│   │                     savings · import · settings · onboarding
│   ├── components/       Shared UI (budget rows, balance bar) + charts/ (SVG, no libraries)
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
4. ◑ Tracking – debt, savings, balances and stats done; dedicated weekly review still to do
5. ☐ Polish – transfers between accounts and balances, edit/split transactions in bulk, recurring items, charts, i18n

## Privacy
No servers, no accounts, no analytics. Personal files placed in `samples/` are git-ignored.
