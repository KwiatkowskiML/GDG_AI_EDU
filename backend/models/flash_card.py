from pydantic import BaseModel

class FlashCard(BaseModel):
    id: int
    text: str
    answer: str
    text_reference: str
