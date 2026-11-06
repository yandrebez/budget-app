"""Generates the synthetic fixtures in tests/fixtures (invented data, safe to commit).

    python3 scripts/make-fixtures.py
"""
import datetime as dt
import openpyxl
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

D = dt.datetime
wb = openpyxl.Workbook()
wb.active.title = "Start here"
ws = wb.create_sheet("Budget")
ws.append(["Budget"]); ws.append(["note"]); ws.append(["Showing month", None, D(2026, 10, 1)])
ws.append(["Category", "Group", "Monthly budget", "Actual", "Left"])
for row in [("Pay", "Income", 10000), ("Rent", "Fixed", 4000), ("Phone", "Fixed", 300), ("Loan A", "Debt", 900),
            ("Groceries", "Variable", 1500), ("Rainy day", "Savings", 500), ("Move money", "Transfer", 0)]:
    ws.append([*row, 0, 0])
ws.append(["TOTAL OUT", None, 7200])
ws = wb.create_sheet("Setup")
ws.append(["Setup"]); ws.append(["note"]); ws.append(["Opening balance", 50])
ws.append(["Category", "Group", "Notes"])
for row in [("Pay", "Income", "Net pay"), ("Rent", "Fixed", "Landlord"), ("Phone", "Fixed", None), ("Loan A", "Debt", None),
            ("Groceries", "Variable", None), ("Gifts", "Variable", "Birthdays"), ("Rainy day", "Savings", None), ("Move money", "Transfer", None)]:
    ws.append(row)
ws.append([]); ws.append(["Public holidays"]); ws.append(["Holiday", "Date"])
ws.append(["Day one", D(2026, 1, 1)]); ws.append(["Day two", D(2026, 12, 25)])
ws = wb.create_sheet("Transactions")
ws.append(["Date", "Account", "Category", "Description", "Money in", "Money out", "Group"])
for row in [(D(2026, 10, 23), "Main", "Pay", "Salary", 10000, 0), (D(2026, 10, 24), "Main", "Rent", "October rent", 0, 4000),
            (D(2026, 10, 25), "Main", "Groceries", "Corner shop", 0, 250.5), (D(2026, 10, 26), "Savings acc", "Move money", "Transfer in", 500, 0),
            (D(2026, 10, 27), "Main", "Mystery", "Unknown category", 0, 20), (D(2026, 10, 28), "Main", "Groceries", "Refund as negative out", 0, -20), (None, "Main", "Pay", "Bad date", 5, 0)]:
    ws.append(row)
ws = wb.create_sheet("Debt")
ws.append(["Debt"]); ws.append(["note"]); ws.append([])
ws.append(["Debt", "Balance now", "Interest rate", "Payment this month"])
ws.append(["Loan A", 50000, 0.12, 900]); ws.append(["Card B", 0, 20, 0]); ws.append(["TOTAL OWED", 50000])
ws = wb.create_sheet("Savings")
ws.append(["Savings"]); ws.append(["note"]); ws.append([])
ws.append(["Pot", "Balance now", "Target"])
ws.append(["Rainy day", 1200, 5000]); ws.append(["Holiday fund", 300, 2000]); ws.append(["TOTAL", 1500, 7000])
ws = wb.create_sheet("Cycles")
ws.append(["Pay cycles"]); ws.append(["note"]); ws.append(["Month", "The 25th", "Payday"])
ws.append(["Aug 2026", D(2026, 8, 25), D(2026, 8, 25)]); ws.append(["Oct 2026", D(2026, 10, 25), D(2026, 10, 23)])
ws.append(["Nov 2026", D(2026, 11, 25), D(2026, 11, 25)]); ws.append(["Dec 2026", D(2026, 12, 25), D(2026, 12, 24)])
wb.save("tests/fixtures/sample-budget.xlsx")

def pdf(path, header, rows, x_cols, right_cols, preamble=()):
    c = canvas.Canvas(path, pagesize=A4); c.setFont("Helvetica", 9)
    y = 800
    for line in preamble:
        c.drawString(40, y, line); y -= 14
    y -= 10
    for x, h in zip(x_cols, header):
        c.drawRightString(x, y, h) if x in right_cols else c.drawString(x, y, h)
    y -= 16
    for r in rows:
        for x, v in zip(x_cols, r):
            if v == "": continue
            c.drawRightString(x, y, v) if x in right_cols else c.drawString(x, y, v)
        y -= 14
    c.save()

# Signed amount + balance (unsigned amounts: direction must come from the balance)
pdf("tests/fixtures/statement-balance.pdf", ["Date", "Description", "Amount", "Balance"],
    [("01 Oct 2026", "Opening salary", "10,000.00", "10,050.00"), ("02 Oct 2026", "Corner shop", "250.50", "9,799.50"),
     ("03 Oct 2026", "Phone bill", "300.00", "9,499.50"), ("04 Oct 2026", "Refund", "75.00", "9,574.50")],
    [40, 120, 420, 520], {420, 520}, preamble=["Example Bank statement", "Statement period 01 Oct 2026 to 31 Oct 2026"])
# Separate in / out columns
pdf("tests/fixtures/statement-inout.pdf", ["Date", "Description", "Money in", "Money out", "Balance"],
    [("2026/10/01", "Salary", "10,000.00", "", "10,050.00"), ("2026/10/02", "Corner shop", "", "250.50", "9,799.50"),
     ("2026/10/02", "Pharmacy", "", "99.99", "9,699.51")],
    [40, 120, 330, 410, 500], {330, 410, 500})


# ---------------------------------------------------------------------------
# A second layout: transactions split over monthly sheets, side-by-side tables,
# fee + running balance columns, accounts with types, goals, budget "Type",
# a Lists sheet and pay periods. Names and numbers are invented.
# ---------------------------------------------------------------------------
wb = openpyxl.Workbook()
ws = wb.active; ws.title = "Overview"
ws.append(["Overview"]); ws.append(["Live from the monthly tabs"]); ws.append([])
ws.append(["Metric", "Value"]); ws.append(["Total spend", 1234.5]); ws.append(["Total income", 9000])

ws = wb.create_sheet("Accounts")
ws.append(["Account Summary"]); ws.append(["note"]); ws.append(["Pay period:", "Oct-Nov 2026", "from", D(2026, 10, 25), "to", D(2026, 11, 24)])
ws.append(["PERSONAL ACCOUNTS"])
hdr = ["Account Name", "Account Type", "Account Number", "Opening Balance (25th)", "Money In", "Money Out", "Closing Balance (24th)", "Interest Rate", "Notes"]
ws.append(hdr)
ws.append(["Daily", "Transactional", "1111", 500, 9000, 3000, 6500, None, "Salary lands here"])
ws.append(["Rainy Day", "Savings Goal", "2222", 2000, 100, 0, 2100, None, "Emergency"])
ws.append(["Fixed Deposit (Inv Account)", "Fixed-Term Savings", "3333", 50000, 0, 0, 50000, 0.06, None])
ws.append(["TOTAL", None, None, 52500, 9100, 3000, 58600])
ws.append([])
ws.append(["BUSINESS ACCOUNTS"])
ws.append(hdr)
ws.append(["Biz Current", "Business Transactional", "4444", 100, 0, 0, 100, None, None])
ws.append(["BUSINESS TOTAL", None, None, 100, 0, 0, 100])

ws = wb.create_sheet("Goals")
ws.append(["Goal Tracker"]); ws.append([])
ws.append(["Goal / Account", "Current Balance", "Goal Target", "Remaining to Goal", "% Progress"])
ws.append(["Rainy Day", 2100, 5000, 2900, 0.42]); ws.append(["Holiday", 300, 2000, 1700, 0.15]); ws.append(["TOTAL", 2400, 7000, 4600, 0.34])

ws = wb.create_sheet("Plan")
ws.append(["Monthly Budget"]); ws.append([]); ws.append(["SPENDING CATEGORIES"])
ws.append(["Category", "Monthly Budget", "Actual Spent", "Variance", "Type"])
for row in [("Rent", 3000, 3000, 0, "Fixed"), ("Groceries", 1500, 400, 1100, "Variable"), ("Takeaways", 500, 150, 350, "Variable"), ("Gym", 300, 0, 300, "Fixed")]:
    ws.append(row)
ws.append(["TOTAL", 5300, 3550, 1750])
ws.append([]); ws.append(["WEEKLY TRACKER"]); ws.append(["Category", "Monthly Budget", "Week 1", "Week 2"])
ws.append(["Week starts", None, D(2026, 10, 25), D(2026, 11, 1)])
ws.append(["Groceries", 1500, 400, 0]); ws.append(["Takeaways", 500, 150, 0]); ws.append(["TOTAL", 2000, 550, 0])

ws = wb.create_sheet("Lists")
ws.append(["Lists"]); ws.append([])
ws.append(["Category", "Type", None, "Accounts", None, "Pay Period (tab name)", "Starts (25th)", "Ends (24th)"])
cats = [("Transfer", "Transfer"), ("Groceries", "Variable"), ("Rent", "Fixed"), ("Takeaways", "Variable"), ("Gym", "Fixed"), ("Salary", "Income")]
periods = [("Aug-Sep 2026", D(2026, 8, 25), D(2026, 9, 24)), ("Sep-Oct 2026", D(2026, 9, 25), D(2026, 10, 24)),
           ("Oct-Nov 2026", D(2026, 10, 25), D(2026, 11, 24)), ("Nov-Dec 2026", D(2026, 11, 25), D(2026, 12, 24))]
accts = ["Daily", "Rainy Day", "Fixed Deposit (Inv)", "Biz Current"]
for i in range(6):
    c = cats[i]; p = periods[i] if i < len(periods) else (None, None, None)
    ws.append([c[0], c[1], None, accts[i] if i < len(accts) else None, None, *p])

# Monthly tabs: transactions table + a side summary table + a pay-period date row.
def month_sheet(name, start, end, rows, opening):
    ws = wb.create_sheet(name)
    ws.append([f"Transactions - {name}"]); ws.append(["One tab per pay period"]); ws.append(["Period:", start, "to", end])
    ws.append(["Date", "Account", "Description", "Category", "Money In", "Money Out", "Fee", "Balance", "Type", None,
               "Account", "Opening (25th)", "Money In", "Money Out"])
    bal = dict(opening)
    side = [("Daily", opening["Daily"]), ("Rainy Day", opening["Rainy Day"]), ("PERSONAL TOTAL", None)]
    for i, (d, acct, desc, cat, mi, mo, fee) in enumerate(rows):
        bal[acct] = round(bal[acct] + (mi or 0) - (mo or 0) - (fee or 0), 2)
        line = [d, acct, desc, cat, mi, mo, fee, bal[acct], "Variable"]
        if i < len(side):
            line += [None, side[i][0], side[i][1], None, None]
        ws.append(line)
    return bal

bal = {"Daily": 500, "Rainy Day": 2000}
bal = month_sheet("Sep-Oct 2026", D(2026, 9, 25), D(2026, 10, 24), [
    (D(2026, 9, 25), "Daily", "Salary", "Salary", 9000, None, None),
    (D(2026, 9, 26), "Daily", "Landlord", "Rent", None, 3000, 2),
    (D(2026, 9, 27), "Daily", "Shop one", "Groceries", None, 400.5, None),
    (D(2026, 9, 28), "Daily", "Move to savings", "Transfer", None, 100, None),
    (D(2026, 9, 28), "Rainy Day", "From daily", "Transfer", 100, None, None),
], bal)
bal = month_sheet("Oct-Nov 2026", D(2026, 10, 25), D(2026, 11, 24), [
    (D(2026, 10, 25), "Daily", "Salary", "Salary", 9000, None, None),
    (D(2026, 10, 26), "Daily", "Takeaway place", "Takeaways", None, 150, 1.5),
    (D(2026, 10, 27), "Daily", "Gym debit order", "Gym", None, 300, 2),
], bal)
month_sheet("Nov-Dec 2026", D(2026, 11, 25), D(2026, 12, 24), [], bal)   # blank month: header only
wb.save("tests/fixtures/sample-monthly.xlsx")
