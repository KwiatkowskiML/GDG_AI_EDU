// MicTest.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';

// --- PCM Conversion Helper Functions ---
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
  console.log("[webmToPcm] Starting conversion for blob:", webmBlob.size, webmBlob.type);
  if (!webmBlob || !webmBlob.type.startsWith('audio/')) {
    console.warn("[webmToPcm] Blob type is not audio or blob is null. Type:", webmBlob?.type);
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
    const numberOfOutputChannels = 1;
    const durationForContext = Math.max(decodedAudioBuffer.duration, 1 / targetSampleRate); // Ensure duration > 0
    const offlineContext = new OfflineAudioContext(
      numberOfOutputChannels,
      durationForContext * targetSampleRate,
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

  // Ensure we are taking data from a mono buffer, or the first channel if multi-channel after resampling (though we specified 1 channel for offline context)
  const pcmSamplesFloat32 = finalAudioBuffer.getChannelData(0);
  await audioContext.close();

  if (convertTo16Bit) {
    const pcmInt16 = float32ToInt16(pcmSamplesFloat32);
    return {
      samples: pcmInt16,
      sampleRate: finalAudioBuffer.sampleRate,
      numberOfChannels: 1, // Output is mono
      format: 'int16',
      duration: finalAudioBuffer.duration,
    };
  } else {
    // This path shouldn't be taken given convertTo16Bit defaults to true and is hardcoded in the call
    throw new Error("This webmToPcm version is configured for Int16 output.");
  }
}
// --- End PCM Conversion Helpers ---


// --- PCM Playback Helper ---
let pcmPlaybackAudioContext: AudioContext | null = null;
let pcmSourceNode: AudioBufferSourceNode | null = null;

function playPcmData(
    pcmArrayBuffer: ArrayBuffer,
    sampleRate: number,
    onPlaybackEnd: () => void
) {
  if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== 'closed') {
    pcmPlaybackAudioContext.close().then(() => {
      if (pcmSourceNode) {
          try { pcmSourceNode.stop(); } catch(e) {/* ignore if already stopped */}
      }
      _doPlayPcmData(pcmArrayBuffer, sampleRate, onPlaybackEnd);
    });
  } else {
    _doPlayPcmData(pcmArrayBuffer, sampleRate, onPlaybackEnd);
  }
}

function _doPlayPcmData(
    pcmArrayBuffer: ArrayBuffer,
    sampleRate: number,
    onPlaybackEnd: () => void
) {
  // console.log(`[playPcmData] Attempting to play ${pcmArrayBuffer.byteLength} bytes of PCM at ${sampleRate}Hz.`);
  pcmPlaybackAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });

  const int16Array = new Int16Array(pcmArrayBuffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }

  const audioBuffer = pcmPlaybackAudioContext.createBuffer(1, float32Array.length, sampleRate);
  audioBuffer.copyToChannel(float32Array, 0);

  pcmSourceNode = pcmPlaybackAudioContext.createBufferSource();
  pcmSourceNode.buffer = audioBuffer;
  pcmSourceNode.connect(pcmPlaybackAudioContext.destination);
  pcmSourceNode.onended = () => {
    console.log("[playPcmData] Playback finished.");
    onPlaybackEnd();
    if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== 'closed') {
      pcmPlaybackAudioContext.close().then(() => pcmPlaybackAudioContext = null);
    }
    pcmSourceNode = null;
  };
  pcmSourceNode.start();
}

function stopPcmDataPlayback() {
  if (pcmSourceNode) {
    try { pcmSourceNode.stop(); } catch (e) { /* ignore if already stopped */ }
  } else if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== 'closed') {
    pcmPlaybackAudioContext.close().then(() => pcmPlaybackAudioContext = null);
  }
}
// --- End PCM Playback Helper ---


const TARGET_SAMPLE_RATE = 16000;
const RECORDING_DURATION_MS = 10000; // 10 seconds

const MicTest: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [wsStatus, setWsStatus] = useState<string>("Disconnected");
  const [systemMessages, setSystemMessages] = useState<string[]>([]);
  const [isPlayingServerAudio, setIsPlayingServerAudio] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const addSystemMessage = (content: string) => {
    setSystemMessages(prev => [...prev, content].slice(-100)); // Keep last 100
    const messagesContainer = document.getElementById('system-messages-container');
    if (messagesContainer) {
        setTimeout(() => messagesContainer.scrollTop = messagesContainer.scrollHeight, 0);
    }
  };

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const ws_url = `ws://localhost:8000/stream/test/echo/123}`;
    setWsStatus(`Connecting to ${ws_url}...`);
    addSystemMessage(`Attempting to connect to: ${ws_url}`);

    const ws = new WebSocket(ws_url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setWsStatus("Connected");
      addSystemMessage("WebSocket connection opened.");
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        addSystemMessage(`Received ${event.data.byteLength} bytes of audio data from server.`);
        if (event.data.byteLength > 0) {
          setIsPlayingServerAudio(true);
          playPcmData(event.data, TARGET_SAMPLE_RATE, () => setIsPlayingServerAudio(false));
        }
      } else if (typeof event.data === 'string') {
        try {
          const packet = JSON.parse(event.data);
          if (packet.error) addSystemMessage(`Server Error: ${packet.error}`);
          else if (packet.status) addSystemMessage(`Server Status: ${packet.status}`);
          else addSystemMessage(`Received Text/JSON: ${event.data}`);
        } catch (e) {
          addSystemMessage(`Received Text: ${event.data}`);
        }
      } else {
        addSystemMessage("Received unknown data type from server.");
      }
    };

    ws.onclose = (event) => {
      setWsStatus(`Closed: ${event.reason || 'No reason'} (Code: ${event.code})`);
      addSystemMessage(`WebSocket closed. Code: ${event.code}. Reconnecting...`);
      wsRef.current = null;
      if (event.code !== 1000 && event.code !== 1005) { // Avoid reconnect on normal closure
        setTimeout(connectWebSocket, 5000);
      }
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      setWsStatus("Error");
      addSystemMessage("WebSocket error occurred.");
    };
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => { // Cleanup function
      stopPcmDataPlayback();
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (wsRef.current) {
        addSystemMessage("Closing WebSocket connection on component unmount.");
        wsRef.current.onclose = null; // Prevent reconnect logic
        wsRef.current.close(1000, "Client unmounting"); // Normal closure
        wsRef.current = null;
      }
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          addSystemMessage("Microphone stream stopped on unmount.");
      }
    };
  }, [connectWebSocket]);


  const startRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addSystemMessage("Cannot record: WebSocket is not connected.");
      return;
    }
    setIsRecording(true);
    audioChunksRef.current = [];
    const durationInSeconds = RECORDING_DURATION_MS / 1000;
    setCountdown(durationInSeconds);
    addSystemMessage(`Recording for ${durationInSeconds} seconds... Speak now!`);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            // Requesting a specific sample rate here is a hint, browser may ignore or adapt.
            // Actual resampling to TARGET_SAMPLE_RATE happens in webmToPcm if needed.
            // sampleRate: TARGET_SAMPLE_RATE,
            echoCancellation: true,
            noiseSuppression: true,
        }
      });
      streamRef.current = stream;

      const options: MediaRecorderOptions = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        console.warn(`${options.mimeType} not supported, trying audio/webm default.`);
        options.mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
            addSystemMessage("audio/webm is not supported by this browser for recording.");
            setIsRecording(false); setCountdown(0);
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop()); // Release mic
            return;
        }
      }
      mediaRecorderRef.current = new MediaRecorder(stream, options);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        // This onstop is now primarily for when the 10s timer calls .stop()
        // or if the user manually calls stop (though we removed that button for this demo flow)
        addSystemMessage("Recording duration ended. Processing and sending full audio...");
        setIsRecording(false); // Update state here as recording is truly over
        setCountdown(0);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); // Clear interval just in case


        const fullAudioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
        audioChunksRef.current = [];

        if (fullAudioBlob.size > 0) {
          try {
            const pcmData = await webmToPcm(fullAudioBlob, true, TARGET_SAMPLE_RATE);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(pcmData.samples.buffer);
              addSystemMessage(`Sent full audio recording: ${pcmData.samples.byteLength} bytes.`);
            } else {
              addSystemMessage("Could not send audio: WebSocket not open.");
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Error processing or sending full audio:", error);
            addSystemMessage(`Error processing full audio: ${errorMessage}`);
          }
        } else {
            addSystemMessage("No audio data collected to send.");
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            addSystemMessage("Microphone stream stopped.");
        }
      };

      mediaRecorderRef.current.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        const mediaError = event as ErrorEvent; // Cast to ErrorEvent for better typing
        addSystemMessage(`MediaRecorder error: ${mediaError.error?.name || 'Unknown error'}`);
        setIsRecording(false); setCountdown(0);
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      };

      mediaRecorderRef.current.start(); // No timeslice for full recording

      // Start countdown timer display
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => {
          const next = prev - 1;
          if (next <= 0) {
            clearInterval(countdownIntervalRef.current!);
            return 0;
          }
          return next;
        });
      }, 1000);

      // Automatically stop recording after RECORDING_DURATION_MS
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          addSystemMessage("10 seconds up! Stopping recording...");
          mediaRecorderRef.current.stop(); // This will trigger onstop
        }
      }, RECORDING_DURATION_MS);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Error starting recording (getUserMedia or MediaRecorder setup):", err);
      addSystemMessage(`Error starting recording: ${errorMessage}`);
      setIsRecording(false); setCountdown(0);
    }
  };

  // No explicit stopRecording button needed for this "10s and send" demo flow,
  // but keeping the function stub in case it's re-added.
  // const stopRecording = () => {
  //   if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
  //     if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current); // Clear auto-stop
  //     if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  //     setCountdown(0);
  //     mediaRecorderRef.current.stop(); // Manually stop, will trigger onstop
  //     addSystemMessage("Recording stopped by user.");
  //   }
  //   setIsRecording(false);
  // };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '600px', margin: 'auto' }}>
      <h2>Audio Recorder (10s Demo)</h2>
      <p style={{ fontSize: '0.8em', color: '#555' }}>Status: {wsStatus}</p>

      <div>
        <button
          onClick={startRecording}
          disabled={isRecording || wsStatus !== 'Connected'}
          style={{ marginRight: '10px', padding: '10px', fontSize: '1.1em' }}
        >
          {isRecording ? `Recording... ${countdown}s` : "Start 10s Recording"}
        </button>
        {/* <button onClick={stopRecording} disabled={!isRecording} style={{ padding: '10px' }}>
          Stop Recording
        </button> */}
      </div>

      <div id="system-messages-container" style={{ marginTop: '20px', height: '300px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', background: '#f9f9f9' }}>
        {systemMessages.map((msg, index) => (
          <div key={index} style={{ marginBottom: '8px', fontSize: '0.9em', color: '#333' }}>
            <span>{msg}</span>
          </div>
        ))}
         {isPlayingServerAudio && (
            <div style={{ textAlign: 'center', color: 'blue', fontStyle: 'italic', padding: '5px' }}>
                Playing audio from server...
            </div>
        )}
      </div>
    </div>
  );
};

export default MicTest;