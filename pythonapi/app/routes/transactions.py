from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date
import databases
import sqlalchemy

DATABASE_URL = "postgresql://postgres:123qwe@localhost/q_analytix"
database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

transactions = sqlalchemy.Table(
    "transactions", metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("type", sqlalchemy.String(length=50)),
    sqlalchemy.Column("amount", sqlalchemy.Numeric(12, 2)),
    sqlalchemy.Column("description", sqlalchemy.Text),
    sqlalchemy.Column("date", sqlalchemy.Date),
    sqlalchemy.Column("category", sqlalchemy.String(length=100)),
    sqlalchemy.Column("account_id", sqlalchemy.Integer),
    sqlalchemy.Column("created_at", sqlalchemy.TIMESTAMP),
)

accounts = sqlalchemy.Table(
    "accounts", metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("code", sqlalchemy.String(length=10)),
    sqlalchemy.Column("name", sqlalchemy.String(length=100)),
    sqlalchemy.Column("type", sqlalchemy.String(length=50)),
)

class TransactionIn(BaseModel):
    type: str
    amount: float
    description: Optional[str] = None
    date: date
    category: Optional[str] = None
    account_id: Optional[int] = None

router = APIRouter()

@router.on_event("startup")
async def startup():
    await database.connect()

@router.on_event("shutdown")
async def shutdown():
    await database.disconnect()

@router.get("/accounts")
async def list_accounts():
    query = accounts.select()
    return await database.fetch_all(query)

@router.post("/manual")
async def add_transaction(transaction: TransactionIn):
    query = transactions.insert().values(
        type=transaction.type,
        amount=transaction.amount,
        description=transaction.description,
        date=transaction.date,
        category=transaction.category,
        account_id=transaction.account_id,
    )
    last_record_id = await database.execute(query)
    return {"id": last_record_id, "message": "Transaction added successfully"}
