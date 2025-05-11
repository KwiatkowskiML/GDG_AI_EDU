from app.agent.transcribe_agent import TranscribeAgent
from fastapi import WebSocket
from app.agent.real_time_answer import answer_with_pdf

from app.agent.real_time_answer import TTSStreamer

PDF_PATH = "./app/data/attention_is_all_you_need.pdf"

async def transcribe(transcribe_agent: TranscribeAgent, socket: WebSocket, id: str) -> None:
    try:
        tts_streamer = TTSStreamer()
        greeting_text = "Hello, how can I help you today?"

        print(f"Client #{id}: Synthesizing greeting: \"{greeting_text}\"")
        greeting_audio_bytes = await tts_streamer.synthesize(greeting_text)

        await socket.send_bytes(greeting_audio_bytes)
        print(f"Client #{id}: Sent greeting audio.")

    except Exception as e:
        print(f"Client #{id}: Error during initial greeting: {e}")

    while True:
        raw_pcm_audio_chunk = await socket.receive_bytes()
        if not raw_pcm_audio_chunk:
            print(f"Client #{id}: Received empty data, continuing...")
            continue

        try:
            # transcript = await transcribe_agent.transcribe_audio_chunk(raw_pcm_audio_chunk)
            transcript = "Hello, what is the role of the decoder in transformer models?"
            if transcript:
                print(f"Client #{id}: got transcript: \"{transcript}\"")
                async for part in answer_with_pdf(transcript, PDF_PATH):
                    text = part["text_chunk"]
                    audio_bytes = part["audio_chunk"]

                    print(text, end="", flush=True)

                    await socket.send_bytes(audio_bytes)
            else:
                print(f"Client #{id}: Agent returned empty transcript.")
        except Exception as e:
            print(f"Client #{id}: Error during transcription or sending: {e}")