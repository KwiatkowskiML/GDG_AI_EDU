// MicTest.tsx
import { useState, useRef } from "react";

// --- PCM Conversion Helper Functions ---
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result && typeof reader.result !== "string") {
        resolve(reader.result as ArrayBuffer);
      } else {
        reject(
          new Error("Failed to read blob as ArrayBuffer or result was string.")
        );
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

// Re-added float32ToInt16
function float32ToInt16(buffer: Float32Array): Int16Array {
  let l = buffer.length;
  const output = new Int16Array(l);
  while (l--) {
    const s = Math.max(-1, Math.min(1, buffer[l])); // Clamp to [-1, 1]
    output[l] = s < 0 ? s * 0x8000 : s * 0x7fff; // Scale to Int16 range
  }
  return output;
}

interface PcmData {
  samples: Int16Array; // Changed back to Int16Array
  sampleRate: number;
  numberOfChannels: number;
  format: "int16"; // Format is now int16
  duration: number;
}

async function webmToPcm(
  webmBlob: Blob,
  convertTo16Bit: boolean = true, // Default to true, or could remove if always true
  targetSampleRate?: number
): Promise<PcmData> {
  console.log(
    "[webmToPcm] Starting conversion for blob (output will be Int16 PCM if convertTo16Bit is true):",
    webmBlob
  );
  if (!webmBlob || !webmBlob.type.startsWith("audio/")) {
    console.warn(
      "[webmToPcm] Blob type is not audio or blob is null. Type:",
      webmBlob?.type
    );
  }

  const audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)();
  let decodedAudioBuffer: AudioBuffer;

  try {
    const arrayBuffer = await blobToArrayBuffer(webmBlob);
    console.log(
      "[webmToPcm] Blob converted to ArrayBuffer, length:",
      arrayBuffer.byteLength
    );
    decodedAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log(
      `[webmToPcm] Decoded AudioBuffer: ${decodedAudioBuffer.duration.toFixed(
        2
      )}s, ` +
        `${decodedAudioBuffer.sampleRate}Hz, ${decodedAudioBuffer.numberOfChannels}ch`
    );
  } catch (error) {
    console.error("[webmToPcm] Error decoding audio data:", error);
    await audioContext.close();
    throw error;
  }

  let finalAudioBuffer = decodedAudioBuffer;

  if (targetSampleRate && targetSampleRate !== decodedAudioBuffer.sampleRate) {
    console.log(
      `[webmToPcm] Resampling from ${decodedAudioBuffer.sampleRate} Hz to ${targetSampleRate} Hz`
    );
    const offlineContext = new OfflineAudioContext(
      decodedAudioBuffer.numberOfChannels,
      decodedAudioBuffer.duration * targetSampleRate,
      targetSampleRate
    );

    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = decodedAudioBuffer;
    bufferSource.connect(offlineContext.destination);
    bufferSource.start();

    try {
      finalAudioBuffer = await offlineContext.startRendering();
      console.log(
        `[webmToPcm] Resampled AudioBuffer: ${finalAudioBuffer.duration.toFixed(
          2
        )}s, ` +
          `${finalAudioBuffer.sampleRate}Hz, ${finalAudioBuffer.numberOfChannels}ch`
      );
    } catch (err) {
      console.error("[webmToPcm] Error during resampling:", err);
      await audioContext.close();
      throw err;
    }
  }

  const numberOfChannels = finalAudioBuffer.numberOfChannels;
  let pcmSamplesFloat32: Float32Array;

  if (numberOfChannels > 1) {
    console.log(
      `[webmToPcm] Source has ${numberOfChannels} channels. Mixing down to mono.`
    );
    const monoChannelData = new Float32Array(finalAudioBuffer.length);
    for (let i = 0; i < finalAudioBuffer.length; i++) {
      let sum = 0;
      for (let ch = 0; ch < numberOfChannels; ch++) {
        sum += finalAudioBuffer.getChannelData(ch)[i];
      }
      monoChannelData[i] = sum / numberOfChannels;
    }
    pcmSamplesFloat32 = monoChannelData;
  } else {
    pcmSamplesFloat32 = finalAudioBuffer.getChannelData(0);
  }
  console.log(
    `[webmToPcm] Extracted/Mixed mono Float32 PCM data, length: ${pcmSamplesFloat32.length}`
  );

  await audioContext.close();

  if (convertTo16Bit) {
    const pcmInt16 = float32ToInt16(pcmSamplesFloat32);
    console.log(
      `[webmToPcm] Converted to Int16 PCM data, length: ${pcmInt16.length}`
    );
    return {
      samples: pcmInt16,
      sampleRate: finalAudioBuffer.sampleRate,
      numberOfChannels: 1,
      format: "int16",
      duration: finalAudioBuffer.duration,
    };
  } else {
    // This branch is technically not hit if convertTo16Bit is true by default or hardcoded
    // To return Float32, the PcmData interface would need to support it (e.g. PcmData<T extends 'int16' | 'float32'>)
    // For simplicity now, we assume convertTo16Bit=true is the main path
    throw new Error(
      "Float32 output path not fully implemented for this PcmData type, expected Int16."
    );
  }
}
// --- End of PCM Conversion Helper Functions ---

// --- PCM Playback Helper ---
let pcmPlaybackAudioContext: AudioContext | null = null;
let pcmSourceNode: AudioBufferSourceNode | null = null;

function playPcm(int16PcmArray: Int16Array, sampleRate: number) {
  if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== "closed") {
    pcmPlaybackAudioContext.close().then(() => {
      // Close existing context before creating new
      pcmPlaybackAudioContext = null;
      if (pcmSourceNode) pcmSourceNode.stop();
      pcmSourceNode = null;
      console.log("[playPcm] Previous AudioContext closed. Creating new one.");
      _doPlayPcm(int16PcmArray, sampleRate);
    });
  } else {
    _doPlayPcm(int16PcmArray, sampleRate);
  }
}

function _doPlayPcm(int16PcmArray: Int16Array, sampleRate: number) {
  pcmPlaybackAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({ sampleRate });
  console.log(
    `[playPcm] Playing Int16 PCM data. Length: ${int16PcmArray.length}, Sample Rate: ${sampleRate}`
  );

  // 1. Create an AudioBuffer
  const pcmAudioBuffer = pcmPlaybackAudioContext.createBuffer(
    1, // Number of channels (mono)
    int16PcmArray.length, // Number of sample frames
    sampleRate // Sample rate
  );

  // 2. Convert Int16Array back to Float32Array (samples between -1.0 and 1.0)
  const float32Array = new Float32Array(int16PcmArray.length);
  for (let i = 0; i < int16PcmArray.length; i++) {
    float32Array[i] =
      int16PcmArray[i] / (int16PcmArray[i] < 0 ? 0x8000 : 0x7fff);
  }

  // 3. Populate the AudioBuffer
  pcmAudioBuffer.copyToChannel(float32Array, 0); // Channel 0, data

  // 4. Create an AudioBufferSourceNode
  pcmSourceNode = pcmPlaybackAudioContext.createBufferSource();
  pcmSourceNode.buffer = pcmAudioBuffer;

  // 5. Connect to destination and play
  pcmSourceNode.connect(pcmPlaybackAudioContext.destination);
  pcmSourceNode.onended = () => {
    console.log("[playPcm] PCM playback finished.");
    if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== "closed") {
      pcmPlaybackAudioContext.close().then(() => {
        console.log("[playPcm] AudioContext closed after playback.");
        pcmPlaybackAudioContext = null;
      });
    }
    pcmSourceNode = null;
  };
  pcmSourceNode.start();
  console.log("[playPcm] PCM playback started.");
}

function stopPcmPlayback() {
  if (pcmSourceNode) {
    try {
      pcmSourceNode.stop(); // This will trigger onended
      console.log("[stopPcmPlayback] PCM playback stopped via stop().");
    } catch (e) {
      console.warn(
        "[stopPcmPlayback] Error stopping PCM source node (might have already finished):",
        e
      );
    }
  }
  // The onended handler in playPcm will close the context
}

// --- End of PCM Playback Helper ---

const MicTest = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [pcmInfo, setPcmInfo] = useState<PcmData | null>(null);
  const [isPlayingPcm, setIsPlayingPcm] = useState(false); // For PCM playback button state

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setAudioBlob(null);
    setPcmInfo(null);
    setIsPlayingPcm(false);
    stopPcmPlayback(); // Stop any ongoing PCM playback
    audioChunksRef.current = [];
    console.log("[MicTest] Attempting to start recording...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[MicTest] Mic stream obtained.");

      const mimeTypesToTry = [
        "audio/webm;codecs=opus",
        "audio/webm;codecs=vorbis",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      let selectedMimeType =
        mimeTypesToTry.find((mime) => MediaRecorder.isTypeSupported(mime)) ||
        "audio/webm";
      console.log("[MicTest] Using MIME type:", selectedMimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        console.log("[MicTest] Recording stopped. Processing data...");
        const finalAudioBlob = new Blob(audioChunksRef.current, {
          type: selectedMimeType,
        });
        setAudioBlob(finalAudioBlob);
        console.log("[MicTest] Final audio blob created:", finalAudioBlob);
        console.log(
          "[MicTest] Blob size:",
          finalAudioBlob.size,
          "bytes, type:",
          finalAudioBlob.type
        );

        if (finalAudioBlob.size > 0) {
          try {
            // Convert to Int16 PCM, and resample to 16000 Hz
            const pcmData = await webmToPcm(finalAudioBlob, true, 16000);
            setPcmInfo(pcmData);
            console.log("--- PCM CONVERSION RESULT (Int16) ---");
            console.log("  Format:", pcmData.format);
            console.log("  Sample Rate:", pcmData.sampleRate, "Hz");
            console.log("  Channels:", pcmData.numberOfChannels);
            console.log("  Duration:", pcmData.duration.toFixed(2), "s");
            console.log("  Number of samples:", pcmData.samples.length);
            console.log("--------------------------------------");

            if (pcmData.samples.length > 2000) {
              const sum = pcmData.samples.reduce((acc, val) => acc + val, 0);
              console.log(
                "  PCM Int16Array Samples (first 1000 of " +
                  pcmData.samples.length +
                  ", sum: " +
                  sum +
                  "):",
                pcmData.samples.slice(0, 1000)
              );
            } else {
              console.log(
                "  PCM Int16Array Samples (all " +
                  pcmData.samples.length +
                  "):",
                pcmData.samples
              );
            }
          } catch (pcmError) {
            console.error("[MicTest] Error converting to PCM:", pcmError);
          }
        } else {
          console.warn(
            "[MicTest] Final audio blob is empty. Skipping PCM conversion."
          );
        }

        stream.getTracks().forEach((track) => track.stop());
        console.log("[MicTest] Mic stream tracks stopped.");
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      console.log("[MicTest] Recording started successfully.");
    } catch (err) {
      console.error("[MicTest] Mic access or recording start error:", err);
      alert(
        "Error accessing microphone. Please check permissions and try again."
      );
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      console.warn(
        "[MicTest] Stop recording called but not currently recording or no recorder instance."
      );
    }
  };

  const handlePlayPcm = () => {
    if (pcmInfo && pcmInfo.samples) {
      // Simple toggle for button state, actual stop handled by onended or explicitly
      if (isPlayingPcm) {
        stopPcmPlayback();
        setIsPlayingPcm(false);
      } else {
        playPcm(pcmInfo.samples, pcmInfo.sampleRate);
        setIsPlayingPcm(true);
        // The onended callback in playPcm will set isPlayingPcm to false
        // For robustness, listen to pcmSourceNode.onended here if preferred
        if (pcmSourceNode) {
          pcmSourceNode.onended = () => {
            console.log("[MicTestUI] PCM playback finished (onended from UI).");
            setIsPlayingPcm(false);
            // The main onended in playPcm will close the context
          };
        }
      }
    }
  };

  const styles = {
    container: "p-6 space-y-4",
    button:
      "bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50",
    secondaryButton:
      "bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50",
    infoText: "text-sm text-gray-600",
  };

  return (
    <div className="absolute top-16 left-1/5 w-4/5 h-3/4">
      <div className={styles.container}>
        <h2 className="text-2xl font-semibold">
          🎙️ Mic Test & PCM (Int16) Conversion
        </h2>
        <div className="space-x-4">
          <button
            onClick={startRecording}
            disabled={isRecording}
            className={styles.button}
          >
            Start Recording
          </button>
          <button
            onClick={stopRecording}
            disabled={!isRecording}
            className={styles.button}
          >
            Stop Recording
          </button>
        </div>
        {audioBlob && (
          <div className="mt-6 p-4 border rounded-lg shadow">
            <h4 className="text-lg font-medium mb-2">
              Original WebM Playback:
            </h4>
            <audio
              controls
              src={URL.createObjectURL(audioBlob)}
              className="w-full"
            />
            <p className={styles.infoText}>
              Blob Size: {(audioBlob.size / 1024).toFixed(2)} KB, Type:{" "}
              {audioBlob.type}
            </p>
          </div>
        )}
        {pcmInfo && (
          <div className="mt-6 p-4 border rounded-lg shadow bg-gray-50">
            <h4 className="text-lg font-medium mb-2">
              PCM (Int16) Conversion Info:
            </h4>
            <p className={styles.infoText}>Format: {pcmInfo.format}</p>
            <p className={styles.infoText}>
              Sample Rate: {pcmInfo.sampleRate} Hz
            </p>
            {/* ... other info ... */}
            <button
              onClick={handlePlayPcm}
              disabled={!pcmInfo || !pcmInfo.samples.length}
              className={`${styles.secondaryButton} mt-2`}
            >
              {isPlayingPcm ? "Stop PCM Playback" : "Play Converted PCM"}
            </button>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-blue-600">
                Int16 Samples logged to console
              </summary>
              <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                Check your browser's developer console to see the Int16Array.
              </pre>
            </details>
          </div>
        )}
        {!isRecording && !audioBlob && (
          <p className="mt-4 text-gray-500">
            Click "Start Recording" to begin.
          </p>
        )}
      </div>
    </div>
  );
};

export default MicTest;
