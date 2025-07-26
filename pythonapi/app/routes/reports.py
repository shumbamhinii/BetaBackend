from fastapi import APIRouter
from app.routes.transactions import database, transactions  # Reuse existing DB
import sqlalchemy

router = APIRouter()


@router.get("/income-statement")
async def income_statement():
    query = """
    SELECT category, SUM(amount) AS total
    FROM transactions
    WHERE type IN ('income', 'expense')
    GROUP BY category
    """
    rows = await database.fetch_all(query)
    income = sum(row["total"] for row in rows if "Revenue" in row["category"])
    expenses = sum(row["total"] for row in rows if "Expense" in row["category"])
    net_income = income - expenses

    return {
        "income_statement": [
            {"item": "Sales Revenue", "amount": float(income)},
            {"item": "Operating Expenses", "amount": float(expenses)},
            {"item": "Net Income", "amount": float(net_income)}
        ]
    }


@router.get("/trial-balance")
async def trial_balance():
    query = """
    SELECT account, SUM(amount) AS total, type
    FROM transactions
    GROUP BY account, type
    """
    rows = await database.fetch_all(query)
    result = [{"account": row["account"], "debit": float(row["total"]) if row["total"] > 0 else 0,
               "credit": -float(row["total"]) if row["total"] < 0 else 0}
              for row in rows]

    return {"trial_balance": result}


@router.get("/balance-sheet")
async def balance_sheet():
    query = """
    SELECT category, SUM(amount) AS total
    FROM transactions
    WHERE type IN ('asset', 'liability', 'equity')
    GROUP BY category
    """
    rows = await database.fetch_all(query)
    assets = [row for row in rows if row["category"] == "Asset"]
    liabilities = [row for row in rows if row["category"] == "Liability"]
    equity = [row for row in rows if row["category"] == "Equity"]

    return {
        "assets": [{"item": row["category"], "amount": float(row["total"])} for row in assets],
        "liabilities": [{"item": row["category"], "amount": float(row["total"])} for row in liabilities],
        "equity": [{"item": row["category"], "amount": float(row["total"])} for row in equity]
    }


@router.get("/cashflow")
async def cashflow():
    # Sample Mock Data
    return {
        "cashflow": [
            {"category": "Operating Activities", "items": [
                {"item": "Cash Inflows", "amount": 500000},
                {"item": "Cash Outflows", "amount": -300000}
            ]},
            {"category": "Investing Activities", "items": [
                {"item": "Purchase of Equipment", "amount": -150000}
            ]},
            {"category": "Financing Activities", "items": [
                {"item": "Loan Received", "amount": 200000}
            ]}
        ]
    }


@router.get("/stocksheet")
async def stocksheet():
    return {
        "stocksheet": [
            {"item": "Product A", "opening": 100, "purchases": 50, "sales": 80, "closing": 70, "unitPrice": 50, "value": 3500},
            {"item": "Product B", "opening": 200, "purchases": 100, "sales": 150, "closing": 150, "unitPrice": 30, "value": 4500}
        ]
    }


@router.get("/asset-register")
async def asset_register():
    return {
        "asset_register": [
            {"asset": "Vehicle", "category": "Transport", "purchaseDate": "2022-01-10", "cost": 500000, "depreciation": 50000, "bookValue": 450000},
            {"asset": "Computer", "category": "Office Equipment", "purchaseDate": "2023-03-15", "cost": 15000, "depreciation": 2000, "bookValue": 13000}
        ]
    }


@router.get("/debtors")
async def debtors():
    return {
        "debtors": [
            {"customer": "Customer A", "invoiceNo": "INV001", "invoiceDate": "2025-05-01", "dueDate": "2025-06-01", "amount": 12000, "daysOverdue": 10, "status": "Overdue"},
            {"customer": "Customer B", "invoiceNo": "INV002", "invoiceDate": "2025-05-15", "dueDate": "2025-06-15", "amount": 8000, "daysOverdue": 0, "status": "Current"}
        ]
    }


@router.get("/creditors")
async def creditors():
    return {
        "creditors": [
            {"supplier": "Supplier A", "invoiceNo": "SUP001", "invoiceDate": "2025-05-01", "dueDate": "2025-06-01", "amount": 5000, "daysOverdue": 5, "status": "Overdue"},
            {"supplier": "Supplier B", "invoiceNo": "SUP002", "invoiceDate": "2025-05-10", "dueDate": "2025-06-10", "amount": 7000, "daysOverdue": 0, "status": "Current"}
        ]
    }
