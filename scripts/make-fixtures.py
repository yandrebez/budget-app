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
