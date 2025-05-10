from app.models.flash_card import FlashCard

flashcards = [
    FlashCard(
        id=1,
        text="What is the capital of France?",
        answer="Paris",
        text_reference="https://en.wikipedia.org/wiki/Paris"
    ),
    FlashCard(
        id=2,
        text="What is 2 + 2?",
        answer="4",
        text_reference="https://en.wikipedia.org/wiki/Addition"
    ),
]

flashcards_history = [
    {"flashcard_id": "1", "reaction": "Easy", "timestamp": "2023-10-01T12:00:00Z"},
    {"flashcard_id": "2", "reaction": "Hard", "timestamp": "2023-10-02T12:00:00Z"},
]
