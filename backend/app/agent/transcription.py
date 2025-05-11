from app.agent.transcribe_agent import TranscribeAgent
from fastapi import WebSocket

async def transcribe(transcribe_agent : TranscribeAgent, socket : WebSocket, id: str) -> None:
    while True:
        raw_pcm_audio_chunk = await socket.receive_bytes()
        if not raw_pcm_audio_chunk:
            print(f"Client #{id}: Received empty data, continuing...")
            continue

        try:
            transcript = await transcribe_agent.transcribe_audio_chunk(raw_pcm_audio_chunk)
            if transcript:
                print(f"Client #{id}: Sent transcript: \"{transcript}\"")

                # Process here and send back
            else:
                print(f"Client #{id}: Agent returned empty transcript.")
        except Exception as e:
            print(f"Client #{id}: Error during transcription or sending: {e}")