# my_streaming_agent_module.py
import asyncio
import os
import threading
import queue
from dotenv import load_dotenv

# ADK imports
from google.adk.agents import LiveRequestQueue
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.agents.run_config import RunConfig
from google.adk.agents import Agent  # your agent definition import
from google.genai.types import Part, Content
from backend.app.agent.base_agent import root_agent

# Load environment variables for Gemini
load_dotenv()

# Globals
APP_NAME = "Two-Thread Streaming Example"
QUESTION = "Who invented train?"

async def _agent_stream(question: str, out_queue: queue.Queue):
    """
    Starts an ADK live session, sends the question, and streams back
    partial responses into out_queue.
    """
    # 1. Create a session
    session_service = InMemorySessionService()
    session = session_service.create_session(
        app_name=APP_NAME,
        user_id="user1",
        session_id="session1",
    )

    # 2. Create the runner
    runner = Runner(
        app_name=APP_NAME,
        agent=root_agent,
        session_service=session_service,
    )

    # 3. Configure for TEXT streaming only
    run_config = RunConfig(response_modalities=["TEXT"])

    # 4. Live queue for sending user inputs
    live_request_queue = LiveRequestQueue()

    # 5. Start streaming
    live_events = runner.run_live(
        session=session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )

    # 6. Send the initial question
    user_content = Content(role="user", parts=[Part.from_text(text=question)])
    live_request_queue.send_content(content=user_content)

    # 7. Consume events as they arrive
    async for event in live_events:
        # Skip non-partial or empty events
        if not event.partial or not event.content or not event.content.parts:
            continue

        text = event.content.parts[0].text
        if text:
            out_queue.put(text)

        # Once the turn completes, signal the printer and exit
        if event.turn_complete:
            break

    # Signal completion
    out_queue.put(None)


def agent_thread_fn(question: str, out_queue: queue.Queue):
    """
    Sync entrypoint: runs the async streamer via asyncio.run()
    """
    asyncio.run(_agent_stream(question, out_queue))

def printer_thread_fn(in_queue: queue.Queue):
    """
    Reads from in_queue and prints each text chunk immediately.
    Stops when it reads a None sentinel.
    """
    while True:
        text = in_queue.get()
        if text is None:
            break
        # Print with flush to ensure real-time display
        print(text, end="", flush=True)
        print("CHUNK END\n")
    print("\n[STREAM COMPLETE]")


def main():
    q = queue.Queue()

    t1 = threading.Thread(target=agent_thread_fn, args=(QUESTION, q), name="AgentThread")
    t2 = threading.Thread(target=printer_thread_fn, args=(q,), name="PrinterThread")

    # Start both threads
    t2.start()
    t1.start()

    # Wait for both to finish
    t1.join()
    t2.join()


if __name__ == "__main__":
    main()
