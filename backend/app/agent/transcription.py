from app.agent.vad import VoiceActivityDetector
from app.agent.transcribe_agent import TranscribeAgent
from fastapi import WebSocket



async def transcribe(vad : VoiceActivityDetector, transcribe_agent : TranscribeAgent, socket : WebSocket, id: str) -> None:
    try:
        while True:
            raw_pcm_audio_chunk = await socket.receive_bytes()
            if not raw_pcm_audio_chunk:
                print(f"Client #{id}: Received empty data, continuing...")
                continue

            async for speech_segment in vad.process_audio_chunk(raw_pcm_audio_chunk):
                if speech_segment:
                    print(
                        f"Client #{id}: VAD yielded speech segment of {len(speech_segment)} bytes. Sending to agent.")
                    try:
                        transcript = await transcribe_agent.transcribe_audio_chunk(speech_segment)
                        if transcript:
                            print(f"Client #{id}: Sent transcript: \"{transcript}\"")
                        else:
                            print(f"Client #{id}: Agent returned empty transcript.")
                    except Exception as e:
                        print(f"Client #{id}: Error during transcription or sending: {e}")
    finally:
        print(f"Client #{id}: Cleaning up VAD resources...")
        async for speech_segment in vad.cleanup():
            if speech_segment:
                print(
                    f"Client #{id}: VAD yielded speech segment of {len(speech_segment)} bytes from cleanup. Sending to agent.")
                try:
                    transcript = await transcribe_agent.transcribe_audio_chunk(speech_segment)
                    if transcript:
                        print(f"Client #{id}: Sent final transcript from cleanup: \"{transcript}\"")
                except Exception as e_clean:
                    print(f"Client #{id}: Error during cleanup transcription/sending: {e_clean}")

        print(f"Client #{id} connection processing finished.")