from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.flashcards import router as flashcards_router
from app.routes.stream import router as stream_router
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Main service",
    description="All of the routes are in this service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(flashcards_router, prefix="/api")
app.include_router(stream_router, prefix="/stream")

@app.get("/health")
def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy"}