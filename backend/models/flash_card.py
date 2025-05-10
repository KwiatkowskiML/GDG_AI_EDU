from pydantic import BaseModel

class FlashCard(BaseModel):
    id: int
    text: str
    answers: list[str]
    correct_answer: int
    text_reference: str
