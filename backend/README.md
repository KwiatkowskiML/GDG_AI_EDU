# Backend Service

## Setup

### Installation

Install the required dependencies:

```bash
pip install -r requirements.txt
```

## Running the Service

To start the backend service, run:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

This will start the server at `http://localhost:8000` with auto-reload enabled for development.