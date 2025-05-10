from pydantic import BaseModel

class FlashCardAnswer(BaseModel):
    id: int
    answer: int

class Session(BaseModel):
    answers: list[FlashCardAnswer]

class Sessions(BaseModel):
    sessions: list[Session]
