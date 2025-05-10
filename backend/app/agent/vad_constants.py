SAMPLE_RATE = 16000  # Hz - Standard for speech recognition
FRAME_DURATION_MS = 30  # ms - Recommended by webrtcvad for best performance
BYTES_PER_SAMPLE = 2  # 16-bit PCM audio
CHANNELS = 1  # Mono audio

# VAD aggressiveness mode, an integer between 0 and 3.
# 0 is the least aggressive about filtering out non-speech, 3 is the most aggressive.
VAD_AGGRESSIVENESS = 1

# Derived constants based on the above configuration
BYTES_PER_FRAME = int(SAMPLE_RATE * (FRAME_DURATION_MS / 1000.0) * BYTES_PER_SAMPLE * CHANNELS)

# End of Speech (EOS) detection parameters
SILENCE_DURATION_MS_EOS = 700  # ms - How much silence indicates end of speech
NUM_SILENT_FRAMES_EOS_THRESHOLD = int(SILENCE_DURATION_MS_EOS / FRAME_DURATION_MS)

# Minimum speech duration to consider for transcription
MIN_SPEECH_DURATION_MS = 200  # ms - e.g., ignore very short blips
MIN_SPEECH_FRAMES_THRESHOLD = int(MIN_SPEECH_DURATION_MS / FRAME_DURATION_MS)