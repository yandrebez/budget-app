# Spreadsheet → App mapping

How each sheet of the original `Budget_Tracker.xlsx` becomes a part of the app.

| Excel sheet    | Role in Excel                                   | In the app                                      | Code location                          |
|----------------|--------------------------------------------------|-------------------------------------------------|----------------------------------------|
| Start here     | Instructions, colour legend                      | First-run onboarding + Help page                | `src/features/onboarding`              |
| Transactions   | Ledger: date, account, category, in/out, group   | Activity: per-account ledger with balances      | `src/features/transactions`, `src/domain/transactions` |
| Budget         | Monthly budget per category + actual + left      | Budget editor with "left to allocate"           | `src/features/budget`, `src/domain/budget` |
| Dashboard      | Month picker, cycle dates, days left, overruns   | Dashboard                                       | `src/features/dashboard`               |
| This month     | Month summary                                    | Part of Dashboard / month view                  | `src/features/dashboard`               |
| Weekly         | Sunday check-in to catch overruns                | Weekly review screen                            | `src/features/weekly`                  |
| Debt           | Balances, interest, payoff estimates             | Debt tracker                                    | `src/features/debt`, `src/domain/debt` |
| Savings        | Pots, balances, targets, monthly contribution    | Savings pots                                    | `src/features/savings`, `src/domain/savings` |
| History        | Month-over-month                                 | Stats page (summary + charts)                   | `src/features/stats`, `src/domain/stats` |
| Cycles         | Payday = 25th, moved back for weekends/holidays  | Configurable pay-cycle engine                   | `src/domain/cycles`                    |
| Setup          | Categories, groups, opening balance, holidays    | Settings (categories, groups, accounts, holidays)| `src/features/settings`                |
| Plan           | Planning notes                                   | Later phase                                     | —                                      |

## Concepts that must stay configurable (nothing hard-coded)
- **Pay cycle**: day of month, rule when it falls on a weekend/holiday, holiday calendar (SA to 2030 shipped as a preset).
- **Categories & groups** (Income, Fixed, Debt, Savings, Variable…): user-defined, reorderable.
- **Accounts** (Credit, Transactional…) and opening balances.
- **Currency / locale** (default ZAR `R`).
- **Debts** and **savings pots** as user-defined lists.
