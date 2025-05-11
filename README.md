# AI Avatar Interactive Application

This project is an interactive application featuring a 3D avatar that responds to user voice input. The frontend is built with React, utilizing Three.js for 3D rendering and animation. Real-time audio communication with the backend is handled via WebSockets. The Python backend, built with FastAPI, processes the audio, interacts with Google's Gemini API for generating responses, and streams audio back to the frontend.

## Tech Stack

### Frontend

*   **UI Framework:** [React](https://react.dev/) (with TypeScript)
    *   A JavaScript library for building user interfaces with a component-based architecture.
    *   TypeScript is used for static typing, enhancing code quality and maintainability.
*   **3D Rendering & Animation:** [Three.js](https://threejs.org/)
    *   A powerful 3D graphics library for creating and displaying animated 3D computer graphics in a web browser.
    *   Used here via [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber/getting-started/introduction) and [@react-three/drei](https://github.com/pmndrs/drei) for a declarative, React-friendly way to build Three.js scenes.
    *   Manages the rendering of the 3D avatar model and its mouth animations (blendshape manipulation).
*   **Real-time Communication:** [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
    *   Enables bi-directional, real-time communication between the client (browser) and the backend server.
    *   Used to stream user audio (PCM format) to the backend and receive synthesized speech audio from the backend.
*   **Routing:** [React Router](https://reactrouter.com/)
    *   Handles client-side navigation and routing within the single-page application.
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
    *   A utility-first CSS framework for rapidly building custom user interfaces.
*   **Build Tool/Development Server:** (e.g., Vite, Create React App)
    *   Manages the development environment, bundling, and building of the React application.

### Backend

*   **Programming Language:** [Python](https://www.python.org/)
    *   A versatile and widely-used high-level programming language.
*   **Web Framework:** [FastAPI](https://fastapi.tiangolo.com/)
    *   A modern, fast (high-performance) web framework for building APIs with Python 3.7+ based on standard Python type hints.
    *   Handles WebSocket connections, HTTP requests, and orchestrates backend logic.
*   **AI Model Interaction:** [Google Gemini API](https://ai.google.dev/docs/gemini_api_overview) (via `google-generativeai` library)
    *   Used to send user queries (transcribed from audio) to the Gemini large language model and receive generated text responses.
*   **Audio Processing:** (Details to be added based on specific libraries used)
    *   Libraries for converting audio formats (if necessary before sending to Speech-to-Text).
    *   Speech-to-Text (STT) service/library: (e.g., Google Cloud Speech-to-Text, Whisper, etc.) - *You'll need to specify which one you're using for converting user PCM audio to text.*
    *   Text-to-Speech (TTS) service/library: (e.g., Google Cloud Text-to-Speech, ElevenLabs, pyttsx3, etc.) - *Specify which one generates the audio response sent back to the frontend.*
*   **WebSocket Handling:** FastAPI's built-in WebSocket support or libraries like `websockets`.

## Core Functionality Flow

1.  **User Interaction (Frontend):**
    *   The user speaks into their microphone.
    *   The browser captures audio using the Web Audio API.
    *   Audio data is encoded (e.g., as raw PCM samples).
2.  **Audio Streaming (Frontend -> Backend):**
    *   The PCM audio data is streamed to the backend via a WebSocket connection.
3.  **Backend Processing:**
    *   **Audio Reception:** The FastAPI backend receives the PCM audio stream.
    *   **Speech-to-Text (STT):** The audio is converted into text using an STT service/library.
    *   **Query Generation:** The transcribed text is formulated as a query.
    *   **Gemini API Interaction:** The query is sent to the Google Gemini API.
    *   **Response Generation:** Gemini processes the query and generates a text response.
    *   **Text-to-Speech (TTS):** The text response from Gemini is converted into audible speech using a TTS service/library.
4.  **Response Streaming (Backend -> Frontend):**
    *   The synthesized speech audio (potentially with timing/viseme data for lip-sync) is streamed back to the frontend via the WebSocket.
5.  **Avatar Animation & Playback (Frontend):**
    *   The frontend receives the audio stream.
    *   The audio is played back.
    *   Simultaneously, the 3D avatar's mouth is animated (e.g., based on simple heuristics or more advanced viseme data if provided by the backend TTS) using Three.js blendshapes to simulate speaking.

## Project Structure (High-Level)