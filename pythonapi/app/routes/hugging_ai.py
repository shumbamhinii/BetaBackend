import os
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import conn  # assuming this is your PostgreSQL connection

router = APIRouter()

HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/google/flan-t5-base"
HUGGINGFACE_API_KEY = os.getenv("HF_API_KEY")

headers = {
    "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
    "Content-Type": "application/json"
}

class TextDescription(BaseModel):
    description: str

@router.post("/transactions/process-text")
def process_text(description_input: TextDescription):
    description = description_input.description

    prompt = (
        f"Extract transaction details from: \"{description}\". "
        "Respond with JSON including amount, date, account, category."
    )

    res = requests.post(HUGGINGFACE_API_URL, headers=headers, json={"inputs": prompt})

    if res.status_code != 200:
        raise HTTPException(status_code=500, detail="AI model failed")

    try:
        raw_text = res.json()[0]['generated_text']
        data = eval(raw_text)  # You may switch to `json.loads()` if formatted

        # Fallbacks/defaults
        amount = float(data.get("amount", 0))
        date = data.get("date") or "today"
        category = data.get("category", "uncategorized")
        account_name = data.get("account")

        # 🔍 Look up account_id from accounts table
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM accounts WHERE LOWER(name) = LOWER(%s) LIMIT 1", (account_name,))
            row = cur.fetchone()
            account_id = row[0] if row else None

        if not account_id:
            raise HTTPException(status_code=400, detail=f"Account '{account_name}' not found")

        # Insert into transactions table
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO transactions (type, amount, description, date, category, account_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, ("expense", amount, description, date, category, account_id))
            conn.commit()
            new_id = cur.fetchone()[0]

        return {"message": "Transaction added", "transaction_id": new_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process response: {str(e)}")
