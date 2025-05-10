from fastapi import FastAPI
from backend.routes.flashcards import router as flashcards_router
import uvicorn

app = FastAPI()

# Include the flashcards router under /api
app.include_router(flashcards_router, prefix="/api")

if __name__ == "main":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8001,
        reload=True
    )