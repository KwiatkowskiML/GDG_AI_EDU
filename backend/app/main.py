from fastapi import FastAPI
from app.routes.flashcards import router as flashcards_router
from app.routes.stream import router as stream_router
app = FastAPI(
    title="Main service",
    description="All of the routes are in this service",
    version="1.0.0",
)
app.include_router(flashcards_router, prefix="/api")
app.include_router(stream_router, prefix="/stream")

@app.get("/health")
def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy"}
