from fastapi import APIRouter, WebSocket, WebSocketDisconnect
router = APIRouter()


@router.websocket("/ws/{session_id}")
async def websocket_audio_echo_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"Audio Echo Client #{session_id} connected")

    try:
        while True:
            audio_chunk = await websocket.receive_bytes()

            if not audio_chunk:
                print(f"Audio Echo Client #{session_id}: Received empty data, continuing...")
                continue

            print(f"Audio Echo Client #{session_id}: Received {len(audio_chunk)} bytes of audio.")
            await websocket.send_bytes(audio_chunk)
            print(f"Audio Echo Client #{ssession_id}: Echoed {len(audio_chunk)} bytes back.")

    except WebSocketDisconnect:
        print(f"Audio Echo Client #{session_id} disconnected.")
    except Exception as e:
        print(f"Audio Echo Client #{session_id}: An error occurred: {e}")
    finally:
        print(f"Audio Echo Client #{session_id} connection processing finished.")
