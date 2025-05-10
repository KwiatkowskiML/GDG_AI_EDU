import os
from typing import Optional
from google import genai

def transcribe_audio(
    file_path: str,
    model: str = "gemini-2.0-flash",
    prompt: str = "Generate a transcript of the speech.",
    api_key: Optional[str] = None
) -> str:
    """
    Uploads an audio file to Google’s GenAI, runs a transcription prompt, and returns the text.

    Args:
        file_path: Path to the local audio file.
        api_key:   Your Google API key. If None, will read from the env var GOOGLE_API_KEY.
        model:     Which GenAI model to use.
        prompt:    Instruction prompt to send before the file.

    Returns:
        The generated transcript text.
    """
    # Resolve API key
    key = api_key or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise ValueError("No API key provided; set GOOGLE_API_KEY or pass api_key explicitly.")

    # Initialize client
    client = genai.Client(api_key=key)

    # Upload file
    uploaded = client.files.upload(file=file_path)

    # Generate transcript
    response = client.models.generate_content(
        model=model,
        contents=[prompt, uploaded]
    )

    return response.text


if __name__ == "__main__":
    # Example usage:
    path = "/home/michal/studia/sem6/aipd/Znormalizowane/zdanie_a_1.wav"
    transcript = transcribe_audio(path)
    print(transcript)
