from fastapi import APIRouter
from app.services.calculator import add_numbers

router = APIRouter()

@router.get("/add")
def add(a: int, b: int):
    result = add_numbers(a, b)
    return {"result": result}
