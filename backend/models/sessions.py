from pydantic import BaseModel
from backend.models.flash_card import FlashCard

class Session(BaseModel):
    answers: list[FlashCard]

class Sessions(BaseModel):
    sessions: list[Session]
