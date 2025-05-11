// src/components/ModelPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Model from "./Model"; // Your existing Model component rendering the Canvas

// --- PCM Conversion Helper Functions ---
// (These are assumed to be correct from your previous code)
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result && typeof reader.result !== 'string') {
        resolve(reader.result as ArrayBuffer);
      } else {
        reject(new Error("Failed to read blob as ArrayBuffer or result was string."));
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

function float32ToInt16(buffer: Float32Array): Int16Array {
  let l = buffer.length;
  const output = new Int16Array(l);
  while (l--) {
    const s = Math.max(-1, Math.min(1, buffer[l]));
    output[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

interface PcmData {
  samples: Int16Array;
  sampleRate: number;
  numberOfChannels: number;
  format: 'int16';
  duration: number;
}

async function webmToPcm(
  webmBlob: Blob,
  convertTo16Bit: boolean = true,
  targetSampleRate?: number
): Promise<PcmData> {
  if (!webmBlob || !webmBlob.type.startsWith('audio/')) {
    throw new Error("Invalid blob type for PCM conversion");
  }
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  let decodedAudioBuffer: AudioBuffer;
  try {
    const arrayBuffer = await blobToArrayBuffer(webmBlob);
    decodedAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.error("[webmToPcm] Error decoding audio data:", error);
    await audioContext.close();
    throw error;
  }
  let finalAudioBuffer = decodedAudioBuffer;
  if (targetSampleRate && targetSampleRate !== decodedAudioBuffer.sampleRate) {
    const numberOfOutputChannels = 1; // Mono output
    const durationForContext = Math.max(decodedAudioBuffer.duration, 1 / targetSampleRate); // Ensure context duration is valid
    const offlineContext = new OfflineAudioContext(
      numberOfOutputChannels,
      Math.ceil(durationForContext * targetSampleRate), // Ensure integer frame count
      targetSampleRate
    );
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = decodedAudioBuffer;
    bufferSource.connect(offlineContext.destination);
    bufferSource.start();
    try {
      finalAudioBuffer = await offlineContext.startRendering();
    } catch (err) {
      console.error("[webmToPcm] Error during resampling:", err);
      await audioContext.close();
      throw err;
    }
  }
  const pcmSamplesFloat32 = finalAudioBuffer.getChannelData(0); // Assuming mono
  await audioContext.close();
  if (convertTo16Bit) {
    const pcmInt16 = float32ToInt16(pcmSamplesFloat32);
    return {
      samples: pcmInt16,
      sampleRate: finalAudioBuffer.sampleRate,
      numberOfChannels: 1,
      format: 'int16',
      duration: finalAudioBuffer.duration,
    };
  } else {
    // If you need float32 output, adjust this part and the PcmData interface
    throw new Error("This webmToPcm version is configured for Int16 output.");
  }
}
// --- End PCM Conversion Helpers ---


// --- Refactored PCM Playback Helper ---
let globalAudioContext: AudioContext | null = null;
let audioQueue: ArrayBuffer[] = [];
let isPlayingScheduledAudio = false;
let nextChunkStartTime = 0;
let onAllChunksPlayedCallback: (() => void) | null = null;
let totalScheduledDuration = 0;
const MIN_CHUNK_DURATION_TO_SCHEDULE = 0.01; // Avoid scheduling extremely short/empty buffers

function getGlobalAudioContext(sampleRate: number): AudioContext {
  if (!globalAudioContext || globalAudioContext.sampleRate !== sampleRate || globalAudioContext.state === 'closed') {
    if (globalAudioContext && globalAudioContext.state !== 'closed') {
      globalAudioContext.close().catch(e => console.warn("Error closing previous audio context:", e));
    }
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
    nextChunkStartTime = 0;
    totalScheduledDuration = 0;
  } else if (globalAudioContext.state === 'suspended') {
    globalAudioContext.resume().catch(e => console.warn("Error resuming audio context:", e));
  }
  return globalAudioContext;
}

function schedulePcmChunk(pcmArrayBuffer: ArrayBuffer, sampleRate: number) {
  const audioCtx = getGlobalAudioContext(sampleRate);
  const int16Array = new Int16Array(pcmArrayBuffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }

  if (float32Array.length === 0) return; // Don't process empty arrays

  const audioBuffer = audioCtx.createBuffer(1, float32Array.length, sampleRate);
  audioBuffer.copyToChannel(float32Array, 0);

  if (audioBuffer.duration < MIN_CHUNK_DURATION_TO_SCHEDULE) { // Don't schedule tiny buffers
      if (audioQueue.length === 0 && !isPlayingScheduledAudio && totalScheduledDuration < MIN_CHUNK_DURATION_TO_SCHEDULE) {
        // If this was the very last tiny bit, call the main callback
        if (onAllChunksPlayedCallback) {
            onAllChunksPlayedCallback();
            onAllChunksPlayedCallback = null;
        }
      }
      return;
  }


  const sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioCtx.destination);

  const currentTimeInCtx = audioCtx.currentTime;
  const chunkDuration = audioBuffer.duration;
  const startTime = nextChunkStartTime === 0 || nextChunkStartTime < currentTimeInCtx ? currentTimeInCtx : nextChunkStartTime;

  sourceNode.start(startTime);
  const expectedEndTime = startTime + chunkDuration;
  nextChunkStartTime = expectedEndTime;
  totalScheduledDuration += chunkDuration;

  sourceNode.onended = () => {
    totalScheduledDuration -= chunkDuration;
    if (audioQueue.length > 0) {
        playNextInQueue(sampleRate); // Proactively play next if available
    } else if (totalScheduledDuration < MIN_CHUNK_DURATION_TO_SCHEDULE) { // Check if queue is effectively empty
        isPlayingScheduledAudio = false;
        nextChunkStartTime = 0;
        totalScheduledDuration = 0;
        if (onAllChunksPlayedCallback) {
            onAllChunksPlayedCallback();
            onAllChunksPlayedCallback = null;
        }
    }
  };
}

function enqueueAndPlayAudio(pcmArrayBuffer: ArrayBuffer, sampleRate: number) {
  if (pcmArrayBuffer.byteLength === 0) return;
  audioQueue.push(pcmArrayBuffer);
  if (!isPlayingScheduledAudio) {
    playNextInQueue(sampleRate);
  }
}

function playNextInQueue(sampleRate: number) {
  if (audioQueue.length === 0) {
    // If nothing is scheduled beyond a tiny fraction, consider it stopped
    if (totalScheduledDuration < MIN_CHUNK_DURATION_TO_SCHEDULE) {
        isPlayingScheduledAudio = false;
    }
    return;
  }
  isPlayingScheduledAudio = true;
  const chunkToPlay = audioQueue.shift();
  if (chunkToPlay) {
    schedulePcmChunk(chunkToPlay, sampleRate);
  } else {
     // This case should ideally not be hit if length > 0 check is done
     isPlayingScheduledAudio = false;
  }
}

function startPcmStreamingPlayback(onFinished: () => void) {
  stopAllPcmPlaybackAndClearQueue(); // Ensure clean start
  isPlayingScheduledAudio = false;
  audioQueue = [];
  nextChunkStartTime = 0;
  totalScheduledDuration = 0;
  onAllChunksPlayedCallback = onFinished;
}

function stopAllPcmPlaybackAndClearQueue() {
  audioQueue = [];
  isPlayingScheduledAudio = false;
  nextChunkStartTime = 0;
  totalScheduledDuration = 0;
  if (globalAudioContext && globalAudioContext.state !== 'closed') {
    globalAudioContext.close().then(() => {
        globalAudioContext = null;
    }).catch(e => console.warn("Error closing global audio context during stopAll:", e));
  }
  if (onAllChunksPlayedCallback) { // If we stop manually, call the finish callback if it was set
    onAllChunksPlayedCallback();
    onAllChunksPlayedCallback = null;
  }
}
// --- End Refactored PCM Playback Helper ---

const TARGET_SAMPLE_RATE_OUTPUT = 24000; // Sample rate of audio from backend
const TARGET_SAMPLE_RATE_INPUT = 16000;  // Sample rate to send to backend

const ModelPage: React.FC = () => {
  const [isMicRecording, setIsMicRecording] = useState(false);
  const [wsStatus, setWsStatus] = useState<string>("Disconnected");
  const [lastSystemMessage, setLastSystemMessage] = useState<string>('');
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const speechSessionActive = useRef(false);


  const addSystemMessage = useCallback((content: string) => {
    setLastSystemMessage(content);
    console.log("System Message:", content);
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const ws_url = `ws://localhost:8000/stream/discuss/123`; // Replace with your WebSocket URL
    setWsStatus(`Connecting to ${ws_url}...`);
    addSystemMessage(`Connecting to: ${ws_url.split('/')[2]}...`);

    const ws = new WebSocket(ws_url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => { setWsStatus("Connected"); addSystemMessage("WebSocket: Connected"); };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        if (!speechSessionActive.current) {
            speechSessionActive.current = true;
            setIsAvatarSpeaking(true);
            addSystemMessage("AI Tutor started speaking.");
            startPcmStreamingPlayback(() => {
                setIsAvatarSpeaking(false);
                speechSessionActive.current = false;
                addSystemMessage("AI Tutor finished speaking.");
            });
        }
        if (event.data.byteLength > 0) {
            enqueueAndPlayAudio(event.data, TARGET_SAMPLE_RATE_OUTPUT);
        } else if (event.data.byteLength === 0 && speechSessionActive.current) {
            // Potentially an empty "end of stream" marker from backend, if used.
            // The queue logic should handle natural end, but this can be an explicit signal.
            // For now, let the queue empty itself.
        }
      } else if (typeof event.data === 'string') {
        try {
            const packet = JSON.parse(event.data);
            // Example: Server explicitly signals start/end of speech if audio chunks are not enough
            if (packet.type === "speech_status") {
                if (packet.status === "started" && !speechSessionActive.current) {
                    addSystemMessage("Server: Speech started signal.");
                    speechSessionActive.current = true;
                    setIsAvatarSpeaking(true);
                    startPcmStreamingPlayback(() => {
                        setIsAvatarSpeaking(false);
                        speechSessionActive.current = false;
                        addSystemMessage("AI Tutor finished speaking (via signal).");
                    });
                } else if (packet.status === "ended" && speechSessionActive.current) {
                     addSystemMessage("Server: Speech ended signal. Waiting for audio queue to empty.");
                     // The onAllChunksPlayedCallback will handle the final state changes.
                     // If server sends this *after* all audio, it's a confirmation.
                     // If it sends it *before* all audio is played, queue must empty.
                }
            }
            else if(packet.error) addSystemMessage(`Server Error: ${packet.error}`);
            else if(packet.status) addSystemMessage(`Server Status: ${packet.status}`);
            else if(packet.message) addSystemMessage(`Server: ${packet.message}`);
            else addSystemMessage(`Server Text: ${event.data}`);
        } catch(e) { addSystemMessage(`Server Text: ${event.data}`); }
      } else { addSystemMessage("Unknown data from server."); }
    };
    ws.onclose = (event) => {
      setWsStatus(`Closed (Code ${event.code})`);
      addSystemMessage(`WebSocket Closed. ${event.reason || ''}`);
      wsRef.current = null;
      speechSessionActive.current = false;
      setIsAvatarSpeaking(false);
      stopAllPcmPlaybackAndClearQueue();
      if (event.code !== 1000 && event.code !== 1005) {
        addSystemMessage("Attempting to reconnect in 5s...");
        setTimeout(connectWebSocket, 5000);
      }
    };
    ws.onerror = (error) => {
      setWsStatus("Error");
      addSystemMessage(`WebSocket Connection Error: ${error instanceof Event ? 'Network error' : String(error)}`);
      speechSessionActive.current = false;
      setIsAvatarSpeaking(false);
      stopAllPcmPlaybackAndClearQueue();
    };
    wsRef.current = ws;
  }, [addSystemMessage]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      addSystemMessage("ModelPage unmounting. Cleaning up...");
      stopAllPcmPlaybackAndClearQueue();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null; wsRef.current.onmessage = null;
        wsRef.current.onerror = null; wsRef.current.onclose = null;
        wsRef.current.close(1000, "Client unmounting");
        wsRef.current = null;
      }
      setIsAvatarSpeaking(false);
      setIsMicRecording(false);
    };
  }, [connectWebSocket]);

  const handleMouseDownOnSpeakButton = async () => {
    if (wsStatus !== 'Connected' || speechSessionActive.current || isMicRecording) {
      addSystemMessage("Cannot record: Not connected, AI speaking, or already recording.");
      return;
    }
    stopAllPcmPlaybackAndClearQueue(); // Stop any server audio if user interrupts
    setIsMicRecording(true);
    setIsAvatarSpeaking(true);
    audioChunksRef.current = [];
    addSystemMessage("Listening...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: TARGET_SAMPLE_RATE_INPUT } });
      streamRef.current = stream;
      const options: MediaRecorderOptions = { mimeType: 'audio/webm;codecs=opus' };
      // Fallback for mimeType if opus isn't supported (less common now)
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) options.mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
          addSystemMessage("audio/webm recording format not supported.");
          setIsMicRecording(false); setIsAvatarSpeaking(false);
          if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
          return;
      }

      mediaRecorderRef.current = new MediaRecorder(stream, options);
      mediaRecorderRef.current.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      
      mediaRecorderRef.current.onstop = async () => {
        addSystemMessage("Processing your audio...");
        const fullAudioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
        audioChunksRef.current = [];

        if (fullAudioBlob.size > 0) {
          try {
            const pcmData = await webmToPcm(fullAudioBlob, true, TARGET_SAMPLE_RATE_INPUT);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(pcmData.samples.buffer);
              addSystemMessage(`Sent your audio (${(pcmData.samples.byteLength / 1024).toFixed(1)}KB). Waiting for AI...`);
            } else { addSystemMessage("Could not send: WebSocket not open."); if (!speechSessionActive.current) setIsAvatarSpeaking(false); }
          } catch (error) { addSystemMessage(`Error processing audio: ${error instanceof Error ? error.message : String(error)}`); if (!speechSessionActive.current) setIsAvatarSpeaking(false); }
        } else { addSystemMessage("No audio data collected."); if (!speechSessionActive.current) setIsAvatarSpeaking(false); }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
      };
      mediaRecorderRef.current.onerror = (event) => {
        addSystemMessage(`Recorder Error: ${(event as ErrorEvent).error?.name || 'Unknown recorder error'}`);
        setIsMicRecording(false); setIsAvatarSpeaking(false);
        if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
      };
      mediaRecorderRef.current.start(250); // Optional: timeslice to get data more frequently if needed for VAD, but onstop is fine for full utterances.
    } catch (err) {
      addSystemMessage(`Mic Error: ${err instanceof Error ? err.message : String(err)}`);
      setIsMicRecording(false); setIsAvatarSpeaking(false);
    }
  };

  const handleMouseUpOnSpeakButton = () => {
    if (isMicRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
    }
    setIsMicRecording(false);
    if (!speechSessionActive.current) {
        setIsAvatarSpeaking(false);
    }
  };

  const handleMouseLeaveOnSpeakButton = () => { // Good for desktop
    if (isMicRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        setIsMicRecording(false);
        if (!speechSessionActive.current) {
            setIsAvatarSpeaking(false);
        }
    }
  };

  return (
    <div className="absolute top-16 left-1/5 w-4/5 h-[calc(100%-4rem)] flex flex-col items-center justify-center dark:bg-gray-800">
      <div style={{ flexGrow: 1, width: '100%', position: 'relative', maxHeight: 'calc(100% - 140px)' }}> {/* Adjusted maxHeight for status text */}
        <Model isPlayingServerAudio={speechSessionActive.current} />
      </div>

      <div style={{ padding: '10px 20px 20px 20px', textAlign: 'center', width: '100%' }}>
        <button
          onMouseDown={handleMouseDownOnSpeakButton}
          onMouseUp={handleMouseUpOnSpeakButton}
          onMouseLeave={handleMouseLeaveOnSpeakButton} // Added for desktop usability
          onTouchStart={(e) => { e.preventDefault(); handleMouseDownOnSpeakButton(); }} // e.preventDefault() for touch
          onTouchEnd={(e) => { e.preventDefault(); handleMouseUpOnSpeakButton(); }}     // e.preventDefault() for touch
          disabled={wsStatus !== 'Connected' || speechSessionActive.current || isMicRecording}
          className={`py-4 px-8 text-lg font-semibold rounded-full text-white shadow-lg transition-all duration-200 ease-in-out focus:outline-none
            ${isMicRecording ? 'bg-red-500 hover:bg-red-600 scale-95' : 
            (speechSessionActive.current ? 'bg-yellow-500 hover:bg-yellow-600 cursor-not-allowed' : 
            (wsStatus === 'Connected' ? 'bg-sky-500 hover:bg-sky-600 active:scale-95' : 'bg-gray-400 cursor-not-allowed'))}
          `}
          style={{minWidth: '200px'}}
        >
          {isMicRecording ? "Listening..." :
           (speechSessionActive.current ? "AI Speaking..." :
           (wsStatus === 'Connected' ? "Hold to Speak" :
           (wsStatus.startsWith('Connecting') ? "Connecting..." : "Connect")))}
        </button>
      </div>
    </div>
  );
};

export default ModelPage;