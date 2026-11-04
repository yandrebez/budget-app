# Architecture

## Principles
1. **Local-first.** All data lives in the browser (IndexedDB). No account, no server, works offline.
2. **Privacy.** Bank statements are parsed on-device and never uploaded.
3. **Fully customisable.** Categories, groups, accounts, pay cycle, currency and budgets are data, not code.
4. **Pure domain logic.** `src/domain` has no UI/DB imports, so it is easy to unit test (it replaces the Excel formulas).
5. **Feature folders.** Each screen owns its components, hooks and tests under `src/features/<name>`.

## Layers
```
UI (features/, components/)  →  hooks/  →  domain/ (pure calculations)
                                   ↓
                               db/ (IndexedDB repositories)
```

## Folder guide
| Path                    | Purpose |
|-------------------------|---------|
| `public/`               | Static assets, PWA icons, `robots`/favicon |
| `src/app/`              | App shell: router, providers, layout, service-worker registration |
| `src/db/`               | IndexedDB schema, migrations, repositories, export/import of backups |
| `src/domain/`           | Pure logic: cycles, budget maths, debt payoff, savings progress, categorisation rules |
| `src/features/`         | One folder per screen/feature (see mapping doc) |
| `src/features/import/parsers/` | One parser per format: CSV (with column mapping), OFX/QIF, XLSX (this workbook) |
| `src/components/`       | Shared, presentational UI components |
| `src/hooks/`            | Shared React hooks |
| `src/lib/`              | Generic helpers (dates, money formatting, ids) |
| `src/styles/`           | Global styles, design tokens, themes |
| `src/types/`            | Shared TypeScript types |
| `tests/unit/`           | Unit tests (mirrors `src/`) |
| `tests/fixtures/`       | Anonymised sample statements for parser tests |
| `scripts/`              | Dev/maintenance scripts (e.g. convert the original `.xlsx` into a seed JSON) |
| `samples/`              | Your private statements (git-ignored) |
| `docs/`                 | Design docs |

## Data model (draft)
- `Account { id, name, openingBalance }`
- `Group { id, name, kind: income|expense|debt|savings, order }`
- `Category { id, name, groupId, notes, monthlyBudget }`
- `Transaction { id, date, accountId, categoryId, description, moneyIn, moneyOut, importId? }`
- `Debt { id, name, balance, interestRate, categoryId }`
- `SavingsPot { id, name, balance, target, categoryId }`
- `PayCycleSettings { dayOfMonth, weekendRule, holidays[] }`
- `Settings { currency, locale, theme }`

## Statement import flow
`file → detect format → parse → map columns (saved per bank) → auto-categorise (rules from past descriptions) → review screen → de-duplicate → save`

## Roadmap
1. **Foundation** – scaffold, PWA shell, DB, settings (categories/accounts/pay cycle)
2. **Core** – transactions, budget, dashboard, month picker
3. **Import** – CSV with column mapping, then OFX/XLSX, categorisation rules, de-dup
4. **Tracking** – debt, savings, weekly review, history charts
5. **Polish** – onboarding, templates for other users, backup/export, theming, i18n
