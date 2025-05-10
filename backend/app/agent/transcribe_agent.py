# agent.py

import os
import asyncio
import tempfile
from typing import Optional

import google.generativeai as genai
from vad_constants import SAMPLE_RATE, CHANNELS, BYTES_PER_SAMPLE  # BYTES_PER_SAMPLE for context

# Ensure the audio format matches this expected by Gemini for 'audio/l16'
EXPECTED_MIME_TYPE = f'audio/l16;rate={SAMPLE_RATE};channels={CHANNELS}'


class GoogleGeminiAgent:
    def __init__(
            self,
            api_key: Optional[str] = None,
            model_name: str = "gemini-1.5-flash",  # Updated to a common capable model, can be overridden
            prompt: str = "Please transcribe the following audio accurately."  # Default prompt
    ):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not self.api_key:
            # For the mock, we can let it pass, but for real usage, this is critical.
            print("WARNING: GOOGLE_API_KEY not found. Transcription will be mocked.")
            self.client = None
            self.model = None
            self.prompt = prompt
            self.is_mock = True
        else:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel(model_name)
                self.prompt = prompt
                self.model_name = model_name  # Store for potential use
                self.is_mock = False
                print(f"GoogleGeminiAgent initialized with model: {model_name}. Using API Key.")
            except Exception as e:
                print(f"ERROR: Failed to initialize Google Gemini client: {e}")
                print("Transcription will be mocked.")
                self.client = None
                self.model = None
                self.prompt = prompt
                self.is_mock = True

        print(
            f"Agent configured for audio: Sample Rate={SAMPLE_RATE}, Channels={CHANNELS}, Bytes/Sample={BYTES_PER_SAMPLE}")

    async def transcribe_audio_chunk(self, audio_bytes: bytes) -> str:
        """
        Transcribes an audio chunk using Google Gemini.
        The audio_bytes are expected to be raw PCM data matching vad_constants.
        """
        if not audio_bytes:
            print("Agent: Received empty audio chunk for transcription.")
            return ""

        if self.is_mock or not self.model:
            print(f"Agent (Mock): Attempting to transcribe {len(audio_bytes)} bytes of audio.")
            await asyncio.sleep(0.1 + len(audio_bytes) / 80000.0)  # Simulate some work
            mock_transcript = f"Mock transcript for audio chunk of {len(audio_bytes)} bytes."
            print(f"Agent (Mock): Mock transcription result: '{mock_transcript}'")
            return mock_transcript

        print(f"Agent: Transcribing {len(audio_bytes)} bytes of audio using Gemini model {self.model_name}.")
        print(
            f"Agent: Audio format: Raw PCM, Sample Rate={SAMPLE_RATE}, Channels={CHANNELS}. Mime: {EXPECTED_MIME_TYPE}")

        temp_file_path = None
        uploaded_file_name_for_cleanup = None

        try:
            # Create a temporary file to store the audio bytes.
            # Gemini API's upload_file works with file paths.
            with tempfile.NamedTemporaryFile(delete=False, suffix=".raw") as tmpfile:
                tmpfile.write(audio_bytes)
                temp_file_path = tmpfile.name

            # print(f"Agent: Audio chunk written to temporary file: {temp_file_path}")

            # Upload the file. genai.upload_file is synchronous, so run in a thread.
            # The `display_name` is optional but can be helpful for tracking.
            audio_file_for_gemini = await asyncio.to_thread(
                genai.upload_file,
                path=temp_file_path,
                mime_type=EXPECTED_MIME_TYPE,
                display_name=f"session-audio-chunk-{os.path.basename(temp_file_path)}"
            )
            uploaded_file_name_for_cleanup = audio_file_for_gemini.name
            print(
                f"Agent: Audio file uploaded to Gemini: {audio_file_for_gemini.name} ({audio_file_for_gemini.display_name})")

            # Generate content (transcription)
            response = await self.model.generate_content_async(
                [self.prompt, audio_file_for_gemini]  # Pass prompt and then the file object
            )

            # Check for empty or problematic response before accessing .text
            if not response.parts:
                # If response.text throws error due to no parts / candidates
                candidate = response.candidates[0] if response.candidates else None
                if candidate and candidate.finish_reason != 'STOP':
                    print(f"Agent: Gemini transcription failed or was blocked. Reason: {candidate.finish_reason}")
                    safety_ratings_str = ", ".join([f"{sr.category.name}: {sr.probability.name}" for sr in
                                                    candidate.safety_ratings]) if candidate.safety_ratings else "N/A"
                    print(f"Agent: Safety Ratings: {safety_ratings_str}")
                    return f"[Transcription Blocked/Failed: {candidate.finish_reason}]"
                else:  # No text, no clear error
                    print(f"Agent: Gemini returned no text in response. Full response: {response}")
                    return "[Transcription Error: No text in response]"

            transcript = response.text
            print(f"Agent: Gemini transcription result: '{transcript}'")
            return transcript

        except Exception as e:
            # Catch specific Gemini API errors if possible, e.g., google.api_core.exceptions
            print(f"Agent: Error during transcription with Gemini: {e}")
            import traceback
            traceback.print_exc()
            return f"[Transcription Error: {str(e)}]"
        finally:
            # Clean up the local temporary file
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                    # print(f"Agent: Deleted temporary local file: {temp_file_path}")
                except Exception as e_rem:
                    print(f"Agent: Error deleting temporary local file {temp_file_path}: {e_rem}")

            # Clean up the uploaded file from Gemini service
            if uploaded_file_name_for_cleanup:
                try:
                    # print(f"Agent: Attempting to delete uploaded file from Gemini: {uploaded_file_name_for_cleanup}")
                    await asyncio.to_thread(genai.delete_file, uploaded_file_name_for_cleanup)
                    print(f"Agent: Deleted uploaded file from Gemini: {uploaded_file_name_for_cleanup}")
                except Exception as e_del_gemini:
                    print(f"Agent: Error deleting file {uploaded_file_name_for_cleanup} from Gemini: {e_del_gemini}")
