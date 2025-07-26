from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import google.generativeai as genai
import json

SERVICE_ACCOUNT_JSON = "service_account.json"
genai.configure(credentials=SERVICE_ACCOUNT_JSON)

app = FastAPI()

class TextInput(BaseModel):
    description: str

@app.post("/process-text")
async def process_text(input: TextInput):
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(
            f"Extract structured financial transaction info from: {input.description}\n"
            "Respond with JSON with keys: type, amount, category, date, description."
        )
        result_str = response.text
        
        # Try to parse JSON string
        try:
            result_json = json.loads(result_str)
            return {"success": True, "data": result_json}
        except json.JSONDecodeError:
            # Return raw string if JSON parse fails
            return {"success": False, "raw_response": result_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
