from pydantic import BaseModel
from app.models.flash_card import FlashCard

class Session(BaseModel):
    answers: list[FlashCard]

class Sessions(BaseModel):
    sessions: list[Session]
