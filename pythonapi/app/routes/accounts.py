# app/routes/accounts.py

from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def get_accounts():
    return [
        {"id": 1, "name": "Cash", "type": "asset"},
        {"id": 2, "name": "Bank Account", "type": "asset"},
        {"id": 3, "name": "Accounts Payable", "type": "liability"},
        {"id": 4, "name": "Sales Revenue", "type": "income"},
        {"id": 5, "name": "Rent Expense", "type": "expense"},
    ]
