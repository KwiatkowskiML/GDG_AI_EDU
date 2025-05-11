import os
import re
import time
import base64
import asyncio
import numpy as np
import sounddevice as sd
from google.cloud import texttospeech
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.agents import LiveRequestQueue
from google.adk.runners import Runner
from google.adk.agents.run_config import RunConfig
from google.genai.types import Part, Content
from app.agent.base_agent import root_agent, PDFProcessor

APP_NAME = "Async TTS Streaming"
SENTENCE_FLUSH_INTERVAL = 0.5  # seconds
QUESTION = "what is the role of the decoder?? answer in one sentence"


def sanitize_text(text: str) -> str:
    text = re.sub(r'^\s*[\*\-]\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*{2,}', '', text)
    text = re.sub(r'\#{2,}', '', text)
    text = re.sub(r'\[.*?\]\(.*?\)', '', text)
    text = re.sub(r'<.*?>', '', text)
    return text.replace('*','').replace('_','').strip()

class TTSStreamer:
    def __init__(self):
        self.client = texttospeech.TextToSpeechClient()
        self.voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Neural2-J"
        )
        self.config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            speaking_rate=1.1
        )

    async def synthesize(self, text: str) -> bytes:
        """Run synchronous synthesize under the hood—but wrap in a thread to avoid blocking."""
        loop = asyncio.get_running_loop()
        input_ = texttospeech.SynthesisInput(text=text)
        return await loop.run_in_executor(
            None,
            lambda: self.client.synthesize_speech(
                input=input_, voice=self.voice, audio_config=self.config
            ).audio_content
        )

async def _agent_producer(question: str, doc_text: str, queue_out: asyncio.Queue):
    """Runs the ADK live agent and pushes cleansed text chunks into queue_out."""
    session_svc = InMemorySessionService()
    session = session_svc.create_session(
        app_name=APP_NAME,
        user_id="user1",
        session_id="session1",
        state={"document_text": doc_text}
    )
    runner = Runner(app_name=APP_NAME, agent=root_agent, session_service=session_svc)
    run_cfg = RunConfig(response_modalities=["TEXT"])
    live_q = LiveRequestQueue()
    live_events = runner.run_live(session=session, live_request_queue=live_q, run_config=run_cfg)

    # send the initial user question
    live_q.send_content(Content(role="user", parts=[Part.from_text(text=question)]))

    # stream partials
    async for evt in live_events:
        if not evt.partial or not evt.content or not evt.content.parts:
            continue
        raw = evt.content.parts[0].text or ""
        cleaned = sanitize_text(raw)
        if cleaned:
            await queue_out.put(cleaned)
        if evt.turn_complete:
            break

    # sentinel
    await queue_out.put(None)


async def answer_with_pdf(question: str, pdf_path: str):
    """
    Async generator yielding dicts:
      {
        "text_chunk": "<string>",
        "audio_chunk": b"<raw pcm bytes>"
      }
    """
    # 1) Extract text from PDF synchronously, since most PDF libs are blocking:
    proc = PDFProcessor(pdf_path)
    proc.process_pdf()
    doc_text = proc.full_text

    # 2) Set up shared queue
    text_queue: asyncio.Queue[str | None] = asyncio.Queue()

    # 3) Start agent producer
    producer_task = asyncio.create_task(_agent_producer(question, doc_text, text_queue))

    # 4) TTS streamer instance
    tts = TTSStreamer()

    buffer: list[str] = []
    last_flush = time.monotonic()

    # 5) Consume text_queue, batch, synthesize, and yield
    while True:
        # wait for next text chunk, with a small timeout to flush partial buffers
        try:
            chunk = await asyncio.wait_for(text_queue.get(), timeout=SENTENCE_FLUSH_INTERVAL)
        except asyncio.TimeoutError:
            chunk = None


        now = time.monotonic()

        # if real chunk
        if chunk is not None:
            buffer.append(chunk)
        # or timeout: maybe flush if we have buffer
        if buffer and (chunk is None or any(c in (chunk or "") for c in ".!?") or (now - last_flush) >= SENTENCE_FLUSH_INTERVAL):
            to_say = "".join(buffer)
            audio_bytes = await tts.synthesize(to_say)
            yield {
                "text_chunk": to_say,
                "audio_chunk": audio_bytes
            }
            buffer.clear()
            last_flush = now

        # if producer finished and queue empty, break
        if producer_task.done() and text_queue.empty():
            break

    # ensure producer_task has finished
    await producer_task


async def _playback_test():
    pdf_path = "./backend/app/data/attention_is_all_you_need.pdf"
    async for part in answer_with_pdf(QUESTION, pdf_path):
        text = part["text_chunk"]
        audio_bytes = part["audio_chunk"]

        # print the text chunk
        print(text, end="", flush=True)

        # convert bytes to int16 numpy array
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)

        # normalize to float32 in [-1.0, 1.0]
        audio_float = audio_array.astype(np.float32) / 32768.0

        # play (non-blocking) and wait until done
        sd.wait()
        sd.play(audio_float, samplerate=24000)

    print("\n[ALL DONE]")

if __name__ == "__main__":
    asyncio.run(_playback_test())