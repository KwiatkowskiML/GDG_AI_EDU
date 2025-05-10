import webrtcvad

from app.agent.vad_constants import (
    SAMPLE_RATE, BYTES_PER_FRAME, VAD_AGGRESSIVENESS,
    NUM_SILENT_FRAMES_EOS_THRESHOLD, MIN_SPEECH_FRAMES_THRESHOLD
)

class VoiceActivityDetector:
    def __init__(self, session_id: str):
        self.session_id = session_id
        try:
            self.vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)
        except Exception as e:
            print(
                f"VAD for Client #{self.session_id}: Failed to initialize webrtcvad.Vad with aggressiveness {VAD_AGGRESSIVENESS}. Error: {e}")
            raise

        self.audio_buffer = bytearray()
        self.speech_frames_buffer = bytearray()
        self.consecutive_silent_frames = 0
        self.is_speaking = False
        print(
            f"VAD for Client #{self.session_id}: Initialized. "
            f"Frame Size: {BYTES_PER_FRAME} bytes, "
            f"EOS Threshold: {NUM_SILENT_FRAMES_EOS_THRESHOLD} silent frames, "
            f"Min Speech Frames: {MIN_SPEECH_FRAMES_THRESHOLD}."
        )

    async def process_audio_chunk(self, audio_chunk: bytes):
        self.audio_buffer.extend(audio_chunk)

        while len(self.audio_buffer) >= BYTES_PER_FRAME:
            frame = self.audio_buffer[:BYTES_PER_FRAME]
            del self.audio_buffer[:BYTES_PER_FRAME]

            try:
                is_speech = self.vad.is_speech(frame, SAMPLE_RATE)
            except Exception as e:
                print(
                    f"VAD for Client #{self.session_id}: Error processing frame with webrtcvad: {e}. Frame length: {len(frame)}. Clearing buffer.")
                self.audio_buffer.clear()
                self.speech_frames_buffer.clear()
                self.is_speaking = False
                self.consecutive_silent_frames = 0
                return

            if is_speech:
                if not self.is_speaking:
                    print(f"VAD for Client #{self.session_id}: Speech started.")
                    self.is_speaking = True

                self.speech_frames_buffer.extend(frame)
                self.consecutive_silent_frames = 0
            else:
                if self.is_speaking:
                    self.speech_frames_buffer.extend(frame)
                    self.consecutive_silent_frames += 1

                    if self.consecutive_silent_frames >= NUM_SILENT_FRAMES_EOS_THRESHOLD:
                        print(
                            f"VAD for Client #{self.session_id}: End of speech detected. Buffer has {len(self.speech_frames_buffer)} bytes.")

                        trailing_silence_bytes = NUM_SILENT_FRAMES_EOS_THRESHOLD * BYTES_PER_FRAME

                        if len(self.speech_frames_buffer) > trailing_silence_bytes:
                            speech_part_byte_length = len(self.speech_frames_buffer) - trailing_silence_bytes
                            num_actual_speech_frames = speech_part_byte_length // BYTES_PER_FRAME

                            if num_actual_speech_frames >= MIN_SPEECH_FRAMES_THRESHOLD:
                                speech_segment_to_yield = self.speech_frames_buffer[:speech_part_byte_length]
                                yield speech_segment_to_yield.copy()
                                print(
                                    f"VAD for Client #{self.session_id}: Yielded {len(speech_segment_to_yield)} bytes ({num_actual_speech_frames} frames) of speech.")
                            else:
                                print(
                                    f"VAD for Client #{self.session_id}: Speech segment too short ({num_actual_speech_frames} frames < {MIN_SPEECH_FRAMES_THRESHOLD} min), discarding.")
                        else:
                            print(
                                f"VAD for Client #{self.session_id}: Buffer contains mostly/only silence after speech start, discarding.")

                        self.speech_frames_buffer.clear()
                        self.is_speaking = False
                        self.consecutive_silent_frames = 0
                        print(f"VAD for Client #{self.session_id}: Ready for next utterance.")

    async def cleanup(self):
        if self.is_speaking and len(self.speech_frames_buffer) > 0:
            print(
                f"VAD for Client #{self.session_id}: Connection closing. Processing remaining buffer of {len(self.speech_frames_buffer)} bytes.")

            num_frames_in_buffer = len(self.speech_frames_buffer) // BYTES_PER_FRAME
            if num_frames_in_buffer >= MIN_SPEECH_FRAMES_THRESHOLD:
                yield self.speech_frames_buffer.copy()
                print(
                    f"VAD for Client #{self.session_id}: Yielded {len(self.speech_frames_buffer)} bytes ({num_frames_in_buffer} frames) from cleanup.")
            else:
                print(
                    f"VAD for Client #{self.session_id}: Remaining buffer too short ({num_frames_in_buffer} frames) during cleanup, discarding.")

        self.audio_buffer.clear()
        self.speech_frames_buffer.clear()
        self.is_speaking = False
        self.consecutive_silent_frames = 0
        print(f"VAD for Client #{self.session_id}: Cleaned up.")
