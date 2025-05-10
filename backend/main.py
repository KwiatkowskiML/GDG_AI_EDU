from fastapi import FastAPI
from backend.routes.flashcards import router as flashcards_router
import uvicorn

app = FastAPI(
    title="Main service",
    description="All of the routes are in this service",
    version="1.0.0",
)
app.include_router(flashcards_router, prefix="/api")

@app.get("/health")
def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy"}
