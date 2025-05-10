import os
import asyncio
import tempfile
from typing import Optional

import google.generativeai as genai
from app.agent.vad_constants import SAMPLE_RATE, CHANNELS, BYTES_PER_SAMPLE

EXPECTED_MIME_TYPE = f'audio/l16;rate={SAMPLE_RATE};channels={CHANNELS}'


class TranscribeAgent:
    def __init__(
            self,
            api_key: Optional[str] = None,
            model_name: str = "gemini-1.5-flash",
            prompt: str = "Please transcribe the following audio accurately."
    ):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not found. Cannot initialize GoogleGeminiAgent.")

        try:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(model_name)
            self.prompt = prompt
            self.model_name = model_name
            print(f"GoogleGeminiAgent initialized with model: {model_name}.")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Google Gemini client: {e}")

        print(
            f"Agent configured for audio: Sample Rate={SAMPLE_RATE}, Channels={CHANNELS}, Bytes/Sample={BYTES_PER_SAMPLE}")

    async def transcribe_audio_chunk(self, audio_bytes: bytes) -> str:
        if not audio_bytes:
            print("Agent: Received empty audio chunk for transcription.")
            return ""

        print(f"Agent: Transcribing {len(audio_bytes)} bytes of audio using Gemini model {self.model_name}.")
        print(
            f"Agent: Audio format: Raw PCM, Sample Rate={SAMPLE_RATE}, Channels={CHANNELS}. Mime: {EXPECTED_MIME_TYPE}")

        temp_file_path = None
        uploaded_file_name_for_cleanup = None

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".raw") as tmpfile:
                tmpfile.write(audio_bytes)
                temp_file_path = tmpfile.name

            audio_file_for_gemini = await asyncio.to_thread(
                genai.upload_file,
                path=temp_file_path,
                mime_type=EXPECTED_MIME_TYPE,
                display_name=f"session-audio-chunk-{os.path.basename(temp_file_path)}"
            )
            uploaded_file_name_for_cleanup = audio_file_for_gemini.name
            print(
                f"Agent: Audio file uploaded to Gemini: {audio_file_for_gemini.name} ({audio_file_for_gemini.display_name})")

            response = await self.model.generate_content_async(
                [self.prompt, audio_file_for_gemini]
            )

            if not response.parts:
                candidate = response.candidates[0] if response.candidates else None
                if candidate and candidate.finish_reason != 'STOP':
                    print(f"Agent: Gemini transcription failed or was blocked. Reason: {candidate.finish_reason}")
                    safety_ratings_str = ", ".join([f"{sr.category.name}: {sr.probability.name}" for sr in
                                                    candidate.safety_ratings]) if candidate.safety_ratings else "N/A"
                    print(f"Agent: Safety Ratings: {safety_ratings_str}")
                    return f"[Transcription Blocked/Failed: {candidate.finish_reason}]"
                else:
                    print(f"Agent: Gemini returned no text in response. Full response: {response}")
                    return "[Transcription Error: No text in response]"

            transcript = response.text
            print(f"Agent: Gemini transcription result: '{transcript}'")
            return transcript

        except Exception as e:
            print(f"Agent: Error during transcription with Gemini: {e}")
            import traceback
            traceback.print_exc()
            return f"[Transcription Error: {str(e)}]"
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception as e_rem:
                    print(f"Agent: Error deleting temporary local file {temp_file_path}: {e_rem}")

            if uploaded_file_name_for_cleanup:
                try:
                    await asyncio.to_thread(genai.delete_file, uploaded_file_name_for_cleanup)
                    print(f"Agent: Deleted uploaded file from Gemini: {uploaded_file_name_for_cleanup}")
                except Exception as e_del_gemini:
                    print(f"Agent: Error deleting file {uploaded_file_name_for_cleanup} from Gemini: {e_del_gemini}")
