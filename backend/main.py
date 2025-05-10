from fastapi import FastAPI
from routes.flashcards import router as flashcards_router

app = FastAPI()

# Include the flashcards router under /api
app.include_router(flashcards_router, prefix="/api")
