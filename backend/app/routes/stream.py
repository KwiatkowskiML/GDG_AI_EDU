from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.agent.vad import VoiceActivityDetector
from app.agent.vad_constants import (
    SAMPLE_RATE, FRAME_DURATION_MS, BYTES_PER_FRAME, SILENCE_DURATION_MS_EOS
)
from app.agent.transcribe_agent import TranscribeAgent
import os
from app.agent.transcription import transcribe
router = APIRouter()


def get_transcribe_agent():
    try:
        use_vertex_ai = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "FALSE").upper() == "TRUE"
        api_key = os.getenv("GOOGLE_API_KEY")

        if not api_key and not use_vertex_ai:
            raise ValueError("GOOGLE_API_KEY environment variable not set")

        return TranscribeAgent(api_key=api_key)
    except Exception as e:
        print(f"Failed to initialize TranscribeAgent: {e}")
        raise

@router.websocket("/discuss/{session_id}")
async def ws_discucss(
        websocket: WebSocket,
        session_id: str,
        transcribe_agent: TranscribeAgent = Depends(get_transcribe_agent)
):
    await websocket.accept()
    print(f"Client #{session_id} connected. Initializing VAD...")
    print(
        f"Client #{session_id} Audio Config: SR={SAMPLE_RATE}, FrameDur={FRAME_DURATION_MS}ms, "
        f"Bytes/Frame={BYTES_PER_FRAME}, EOS Silence={SILENCE_DURATION_MS_EOS}ms"
    )
    print(f"Client #{session_id}: EXPECTING RAW PCM (16-bit, {SAMPLE_RATE}Hz, mono) from client.")

    try:
        await transcribe(transcribe_agent, websocket, session_id)
    except WebSocketDisconnect:
        print(f"Client #{session_id} disconnected.")
    except Exception as e:
        print(f"Client #{session_id}: An unexpected error occurred: {e}")

@router.websocket("/test/transcribe/{session_id}")
async def ws_stream_endpoint(
        websocket: WebSocket,
        session_id: str,
        transcribe_agent: TranscribeAgent = Depends(get_transcribe_agent)
):
    await websocket.accept()
    print(f"Client #{session_id} connected. Initializing VAD...")
    print(
        f"Client #{session_id} Audio Config: SR={SAMPLE_RATE}, FrameDur={FRAME_DURATION_MS}ms, "
        f"Bytes/Frame={BYTES_PER_FRAME}, EOS Silence={SILENCE_DURATION_MS_EOS}ms"
    )
    print(f"Client #{session_id}: EXPECTING RAW PCM (16-bit, {SAMPLE_RATE}Hz, mono) from client.")

    try:
        vad_handler = VoiceActivityDetector(session_id)
    except Exception as e:
        print(f"Client #{session_id}: Critical error initializing VAD: {e}")
        await websocket.close(code=1011, reason=f"Server VAD initialization error: {e}")
        return

    try:
        while True:
            raw_pcm_audio_chunk = await websocket.receive_bytes()
            if not raw_pcm_audio_chunk:
                print(f"Client #{session_id}: Received empty data, continuing...")
                continue

            async for speech_segment in vad_handler.process_audio_chunk(raw_pcm_audio_chunk):
                if speech_segment:
                    print(
                        f"Client #{session_id}: VAD yielded speech segment of {len(speech_segment)} bytes. Sending to agent.")
                    try:
                        transcript = await transcribe_agent.transcribe_audio_chunk(speech_segment)
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
    except WebSocketDisconnect:
        print(f"Client #{session_id} disconnected.")
    except Exception as e:
        print(f"Client #{session_id}: An unexpected error occurred: {e}")
    finally:
        print(f"Client #{session_id}: Cleaning up VAD resources...")
        async for speech_segment in vad_handler.cleanup():
            if speech_segment:
                print(
                    f"Client #{session_id}: VAD yielded speech segment of {len(speech_segment)} bytes from cleanup. Sending to agent.")
                try:
                    transcript = await transcribe_agent.transcribe_audio_chunk(speech_segment)
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


@router.websocket("/test/echo/{session_id}")
async def ws_echo_endpoint(
        websocket: WebSocket,
        session_id: str
):
    await websocket.accept()
    print(f"Echo Client #{session_id} connected.")

    try:
        while True:
            audio_chunk = await websocket.receive_bytes()
            if not audio_chunk:
                print(f"Echo Client #{session_id}: Received empty data, continuing...")
                continue

            await websocket.send_bytes(audio_chunk)
            print(f"Echo Client #{session_id}: Echoed {len(audio_chunk)} bytes back to client.")

    except WebSocketDisconnect:
        print(f"Echo Client #{session_id} disconnected.")
    except Exception as e:
        print(f"Echo Client #{session_id}: An unexpected error occurred: {e}")
    finally:
        if websocket.client_state == websocket.client_state.CONNECTED:
            await websocket.close(code=1000)
        print(f"Echo Client #{session_id} connection processing finished.")


@router.websocket("/test/vad/{session_id}")
async def ws_vad_endpoint(
        websocket: WebSocket,
        session_id: str
):
    await websocket.accept()
    print(f"VAD Client #{session_id} connected. Initializing VAD...")
    print(
        f"VAD Client #{session_id} Audio Config: SR={SAMPLE_RATE}, FrameDur={FRAME_DURATION_MS}ms, "
        f"Bytes/Frame={BYTES_PER_FRAME}, EOS Silence={SILENCE_DURATION_MS_EOS}ms"
    )
    print(f"VAD Client #{session_id}: EXPECTING RAW PCM (16-bit, {SAMPLE_RATE}Hz, mono) from client.")

    try:
        vad_handler = VoiceActivityDetector(session_id)
    except Exception as e:
        print(f"VAD Client #{session_id}: Critical error initializing VAD: {e}")
        await websocket.close(code=1011, reason=f"Server VAD initialization error: {e}")
        return

    try:
        while True:
            raw_pcm_audio_chunk = await websocket.receive_bytes()

            if not raw_pcm_audio_chunk:
                print(f"VAD Client #{session_id}: Received empty data, continuing...")
                continue

            async for speech_segment in vad_handler.process_audio_chunk(raw_pcm_audio_chunk):
                print("Speech found")
                if speech_segment:
                    await websocket.send_bytes(speech_segment)
                    print(
                        f"VAD Client #{session_id}: Sent cleaned audio segment of {len(speech_segment)} bytes back to client.")

    except WebSocketDisconnect:
        print(f"VAD Client #{session_id} disconnected.")
    except Exception as e:
        print(f"VAD Client #{session_id}: An unexpected error occurred: {e}")
    finally:
        print(f"VAD Client #{session_id}: Cleaning up VAD resources...")
        async for speech_segment in vad_handler.cleanup():
            if speech_segment and websocket.client_state == websocket.client_state.CONNECTED:
                await websocket.send_bytes(speech_segment)
                print(
                    f"VAD Client #{session_id}: Sent final cleaned segment of {len(speech_segment)} bytes from cleanup.")
                await websocket.send_json({
                    "event": "final_segment_info",
                    "session_id": session_id,
                    "cleaned_bytes": len(speech_segment)
                })

        if websocket.client_state == websocket.client_state.CONNECTED:
            await websocket.close(code=1000)
        print(f"VAD Client #{session_id} connection processing finished.")
