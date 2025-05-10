from fastapi import APIRouter

from backend.data.mocked_data import flashcards

router = APIRouter()

@router.get("/get_flashcards")
def get_flashcards():
    return flashcards


# @router.get("/get_flashcards_history")
# def get_flashcards_history():
#     return flashcards_history