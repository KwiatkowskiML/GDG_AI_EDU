import asyncio
import os
import re
import threading
import queue
import time
import numpy as np
from dotenv import load_dotenv
from google.adk.tools import google_search
from google.cloud import texttospeech
import sounddevice as sd  # For low-latency audio playback

# ADK imports
from google.adk.agents import LiveRequestQueue
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.agents.run_config import RunConfig
from google.genai.types import Part, Content
from backend.app.agent.base_agent import root_agent, PDFProcessor

# Load environment variables
load_dotenv()

# Globals
APP_NAME = "Real-Time TTS Streaming Example"
QUESTION = "what is the role of the decoder??"
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

def sanitize_text(text: str) -> str:
    """Remove markdown formatting and special characters from text"""
    # Remove markdown bullets, asterisks, and other special formatting
    text = re.sub(r'^\s*[\*\-]\s*', '', text, flags=re.MULTILINE)  # Remove bullet points
    text = re.sub(r'\*{2,}', '', text)  # Remove bold markers
    text = re.sub(r'\#{2,}', '', text)  # Remove headers
    text = re.sub(r'\[.*?\]\(.*?\)', '', text)  # Remove links
    text = re.sub(r'<.*?>', '', text)  # Remove HTML tags
    text = text.replace('*', '').replace('_', '')  # Remove remaining special chars
    return text.strip()

class TTSStreamer:
    def __init__(self):
        self.client = texttospeech.TextToSpeechClient()
        self.audio_queue = queue.Queue()
        self.voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Neural2-J"
        )
        self.audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            speaking_rate=1.1
        )
        self._running = True
        self.audio_thread = threading.Thread(target=self._audio_worker)

    def start(self):
        self.audio_thread.start()

    def add_text(self, text: str):
        if text:
            synthesis_input = texttospeech.SynthesisInput(text=text)
            response = self.client.synthesize_speech(
                input=synthesis_input,
                voice=self.voice,
                audio_config=self.audio_config
            )
            self.audio_queue.put(response.audio_content)

    def stop(self):
        self._running = False
        self.audio_queue.put(None)
        self.audio_thread.join()

    def _audio_worker(self):
        while self._running:
            audio_data = self.audio_queue.get()
            if audio_data is None:
                break

            try:
                # Convert bytes to numpy array
                audio_array = np.frombuffer(audio_data, dtype=np.int16)

                # Normalize to float32 for sounddevice
                audio_array = audio_array.astype(np.float32) / 32768.0

                # Play audio with correct parameters
                sd.play(audio_array, samplerate=24000)
                sd.wait()
            except Exception as e:
                print(f"Audio playback error: {str(e)}")


async def _agent_stream(question: str, out_queue: queue.Queue, doc_text: str):
    """Async agent streaming implementation with document context"""
    session_service = InMemorySessionService()

    # Create session
    session = session_service.create_session(
        app_name=APP_NAME,
        user_id="user1",
        session_id="session1",
        state={"document_text": doc_text}
    )

    runner = Runner(
        app_name=APP_NAME,
        agent=root_agent,
        session_service=session_service,
    )

    # Rest of the function remains the same
    run_config = RunConfig(response_modalities=["TEXT"])
    live_request_queue = LiveRequestQueue()

    live_events = runner.run_live(
        session=session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )

    user_content = Content(role="user", parts=[Part.from_text(text=question)])
    live_request_queue.send_content(content=user_content)

    async for event in live_events:
        if not event.partial or not event.content or not event.content.parts:
            continue

        text = event.content.parts[0].text
        if text:
            clean_text = sanitize_text(text)
            out_queue.put(clean_text)

        if event.turn_complete:
            break

    out_queue.put(None)


def agent_thread_fn(question: str, out_queue: queue.Queue, doc_text: str):
    """Agent thread entry point with document context"""
    asyncio.run(_agent_stream(question, out_queue, doc_text))

def printer_tts_thread_fn(in_queue: queue.Queue, tts_streamer: TTSStreamer):
    """Combined printer and TTS buffering thread"""
    buffer = []
    last_flush_time = time.time()

    while True:
        try:
            text = in_queue.get(timeout=0.1)
            if text is None:
                if buffer:
                    tts_streamer.add_text("".join(buffer))
                break

            # Print immediately
            print(text, end="", flush=True)
            buffer.append(text)

            # Flush condition: sentence end or 500ms since last flush
            if any(c in text for c in ".!?") or (time.time() - last_flush_time > 0.5):
                tts_streamer.add_text("".join(buffer))
                buffer = []
                last_flush_time = time.time()

        except queue.Empty:
            if buffer and (time.time() - last_flush_time > 0.5):
                tts_streamer.add_text("".join(buffer))
                buffer = []
                last_flush_time = time.time()

    print("\n[STREAM COMPLETE]")
    tts_streamer.stop()


def answer_with_pdf(question: str, pdf_path: str):
    # Process PDF
    processor = PDFProcessor(pdf_path)
    processor.process_pdf()

    # Initialize TTS streamer
    tts_streamer = TTSStreamer()
    tts_streamer.start()

    # Create communication queue
    agent_queue = queue.Queue()

    # Create and start threads
    threads = [
        threading.Thread(target=agent_thread_fn, args=(question, agent_queue, processor.full_text)),
        threading.Thread(target=printer_tts_thread_fn, args=(agent_queue, tts_streamer))
    ]

    for t in threads:
        t.start()

    # Wait for all threads to complete
    for t in threads:
        t.join()


if __name__ == "__main__":
    answer_with_pdf(QUESTION, "/home/michal/studia/sem6/ds-midi/papers/attention_is_all_you_need.pdf")