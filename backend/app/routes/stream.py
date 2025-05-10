from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.agent.vad import VoiceActivityDetector
from app.agent.vad_constants import (
    SAMPLE_RATE, FRAME_DURATION_MS, BYTES_PER_FRAME, SILENCE_DURATION_MS_EOS
)
from app.agent.transcribe_agent import TranscribeAgent

router = APIRouter()

try:
    gemini_agent = TranscribeAgent()
except ValueError as e:
    print(f"Failed to initialize GoogleGeminiAgent: {e}")
    pass


@router.websocket("/ws/{session_id}")
async def ws_stream_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"Client #{session_id} connected. Initializing VAD...")
    print(
        f"Client #{session_id} Audio Config: SR={SAMPLE_RATE}, FrameDur={FRAME_DURATION_MS}ms, "
        f"Bytes/Frame={BYTES_PER_FRAME}, EOS Silence={SILENCE_DURATION_MS_EOS}ms"
    )

    try:
        vad_handler = VoiceActivityDetector(session_id)
    except Exception as e:
        print(f"Client #{session_id}: Critical error initializing VAD: {e}")
        await websocket.close(code=1011, reason=f"Server VAD initialization error: {e}")
        return

    try:
        while True:
            audio_chunk = await websocket.receive_bytes()
            if not audio_chunk:
                print(f"Client #{session_id}: Received empty data, continuing...")
                continue

            async for speech_segment in vad_handler.process_audio_chunk(audio_chunk):
                if speech_segment:
                    print(
                        f"Client #{session_id}: VAD yielded speech segment of {len(speech_segment)} bytes. Sending to agent.")
                    try:
                        transcript = await gemini_agent.transcribe_audio_chunk(speech_segment)
                        if transcript:
                            await websocket.send_json({
                                "event": "transcript",
                                "session_id": session_id,
                                "transcript": transcript,
                                "audio_length_bytes": len(speech_segment)
                            })
                            print(f"Client #{session_id}: Sent transcript: \"{transcript}\"")
                        else:
                            print(f"Client #{session_id}: Agent returned empty transcript.")
                    except Exception as e:
                        print(f"Client #{session_id}: Error during transcription or sending: {e}")
                        await websocket.send_json({
                            "event": "error",
                            "session_id": session_id,
                            "message": f"Transcription error: {str(e)}"
                        })

    except WebSocketDisconnect:
        print(f"Client #{session_id} disconnected.")
    except Exception as e:
        print(f"Client #{session_id}: An unexpected error occurred: {e}")
        if websocket.client_state == websocket.client_state.CONNECTED:
            await websocket.send_json({
                "event": "error",
                "session_id": session_id,
                "message": f"Server error: {str(e)}"
            })
    finally:
        print(f"Client #{session_id}: Cleaning up VAD resources...")
        async for speech_segment in vad_handler.cleanup():
            if speech_segment:
                print(
                    f"Client #{session_id}: VAD yielded speech segment of {len(speech_segment)} bytes from cleanup. Sending to agent.")
                try:
                    transcript = await gemini_agent.transcribe_audio_chunk(speech_segment)
                    if transcript and websocket.client_state == websocket.client_state.CONNECTED:
                        await websocket.send_json({
                            "event": "final_transcript",
                            "session_id": session_id,
                            "transcript": transcript,
                            "audio_length_bytes": len(speech_segment)
                        })
                        print(f"Client #{session_id}: Sent final transcript from cleanup: \"{transcript}\"")
                except Exception as e_clean:
                    print(f"Client #{session_id}: Error during cleanup transcription/sending: {e_clean}")

        if websocket.client_state == websocket.client_state.CONNECTED:
            await websocket.close(code=1000)
        print(f"Client #{session_id} connection processing finished.")
