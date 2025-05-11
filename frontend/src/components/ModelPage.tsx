// src/components/ModelPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Model from "./Model"; // Your existing Model component

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
  // console.log("[webmToPcm] Starting conversion for blob:", webmBlob.size, webmBlob.type);
  if (!webmBlob || !webmBlob.type.startsWith('audio/')) {
    // console.warn("[webmToPcm] Blob type is not audio or blob is null. Type:", webmBlob?.type);
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
    const durationForContext = Math.max(decodedAudioBuffer.duration, 1 / targetSampleRate);
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
  const pcmSamplesFloat32 = finalAudioBuffer.getChannelData(0);
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
    throw new Error("This webmToPcm version is configured for Int16 output.");
  }
}
// --- End PCM Conversion Helpers ---

// --- PCM Playback Helper ---
let pcmPlaybackAudioContext: AudioContext | null = null;
let pcmSourceNode: AudioBufferSourceNode | null = null;

function playPcmData(pcmArrayBuffer: ArrayBuffer, sampleRate: number, onPlaybackEnd: () => void) {
  if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== 'closed') {
    pcmPlaybackAudioContext.close().then(() => {
      if (pcmSourceNode) { try { pcmSourceNode.stop(); } catch(e) {/* ignore */} }
      _doPlayPcmData(pcmArrayBuffer, sampleRate, onPlaybackEnd);
    });
  } else { _doPlayPcmData(pcmArrayBuffer, sampleRate, onPlaybackEnd); }
}
function _doPlayPcmData(pcmArrayBuffer: ArrayBuffer, sampleRate: number, onPlaybackEnd: () => void) {
  pcmPlaybackAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  const int16Array = new Int16Array(pcmArrayBuffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) { float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF); }
  const audioBuffer = pcmPlaybackAudioContext.createBuffer(1, float32Array.length, sampleRate);
  audioBuffer.copyToChannel(float32Array, 0);
  pcmSourceNode = pcmPlaybackAudioContext.createBufferSource();
  pcmSourceNode.buffer = audioBuffer;
  pcmSourceNode.connect(pcmPlaybackAudioContext.destination);
  pcmSourceNode.onended = () => {
    // console.log("[playPcmData] Playback finished.");
    onPlaybackEnd();
    if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== 'closed') {
      pcmPlaybackAudioContext.close().then(() => pcmPlaybackAudioContext = null);
    }
    pcmSourceNode = null;
  };
  pcmSourceNode.start();
}
function stopPcmDataPlayback() {
  if (pcmSourceNode) { try { pcmSourceNode.stop(); } catch (e) {/* ignore */} }
  else if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== 'closed') {
    pcmPlaybackAudioContext.close().then(() => pcmPlaybackAudioContext = null);
  }
}
// --- End PCM Playback Helper ---

const TARGET_SAMPLE_RATE = 16000;

const ModelPage: React.FC = () => {
  const [isMicRecording, setIsMicRecording] = useState(false);
  const [wsStatus, setWsStatus] = useState<string>("Disconnected");
  const [lastSystemMessage, setLastSystemMessage] = useState<string>(''); // For single status display
  const [isPlayingServerAudio, setIsPlayingServerAudio] = useState(false);
  const [isAvatarAnimating, setIsAvatarAnimating] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const addSystemMessage = useCallback((content: string) => {
    setLastSystemMessage(content); // Update for UI
    console.log("System Message:", content); // Log all messages for debugging
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    // IMPORTANT: Replace with your actual WebSocket server URL
    const ws_url = `ws://localhost:8000/stream/test/echo/123`; // Example echo endpoint
    // const ws_url = `ws://${window.location.hostname}:8000/ws/your_actual_path`; // More realistic example
    setWsStatus(`Connecting to ${ws_url}...`);
    addSystemMessage(`Connecting to: ${ws_url.split('/')[2]}...`);


    const ws = new WebSocket(ws_url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => { setWsStatus("Connected"); addSystemMessage("WebSocket: Connected"); };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        addSystemMessage(`Received ${event.data.byteLength}b audio from server.`);
        if (event.data.byteLength > 0) {
          setIsPlayingServerAudio(true);
          setIsAvatarAnimating(true);
          playPcmData(event.data, TARGET_SAMPLE_RATE, () => {
            setIsPlayingServerAudio(false);
            if (!isMicRecording) setIsAvatarAnimating(false);
            addSystemMessage("Server audio finished.");
          });
        }
      } else if (typeof event.data === 'string') {
        try {
            const packet = JSON.parse(event.data);
            if(packet.error) addSystemMessage(`Server Error: ${packet.error}`);
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
      if (event.code !== 1000 && event.code !== 1005) { // Avoid reconnect on normal or no-status closure
        addSystemMessage("Attempting to reconnect in 5s...");
        setTimeout(connectWebSocket, 5000);
      }
    };
    ws.onerror = () => { setWsStatus("Error"); addSystemMessage("WebSocket Connection Error."); };
    wsRef.current = ws;
  }, [addSystemMessage]); // addSystemMessage is stable

  useEffect(() => {
    console.log("ModelPage mounted. WS Status:", wsStatus); // Log initial status
    connectWebSocket();
    return () => {
      console.log("ModelPage unmounting. Cleaning up...");
      stopPcmDataPlayback();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.onstop = null; // Prevent onstop logic during unmount cleanup
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close(1000, "Client unmounting");
        wsRef.current = null;
      }
      setIsMicRecording(false); // Ensure state is reset
      setIsAvatarAnimating(false);
      setIsPlayingServerAudio(false);
    };
  }, [connectWebSocket]); // connectWebSocket is stable

  const handleMouseDownOnSpeakButton = async () => {
    if (wsStatus !== 'Connected' || isPlayingServerAudio || isMicRecording) {
      addSystemMessage("Cannot record now.");
      return;
    }
    setIsMicRecording(true);
    setIsAvatarAnimating(true);
    audioChunksRef.current = [];
    addSystemMessage("Listening...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const options: MediaRecorderOptions = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options.mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
          addSystemMessage("Recording format not supported."); setIsMicRecording(false); setIsAvatarAnimating(false); if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop()); return;
        }
      }
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      mediaRecorderRef.current.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      
      mediaRecorderRef.current.onstop = async () => {
        // This onstop is now primarily for when user releases mouse/touch
        addSystemMessage("Processing audio...");
        // setIsMicRecording(false); // Set by handleMouseUpOnSpeakButton
        // if (!isPlayingServerAudio) setIsAvatarAnimating(false); // Set by handleMouseUpOnSpeakButton

        const fullAudioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
        audioChunksRef.current = [];

        if (fullAudioBlob.size > 0) {
          try {
            const pcmData = await webmToPcm(fullAudioBlob, true, TARGET_SAMPLE_RATE);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(pcmData.samples.buffer);
              addSystemMessage(`Sent audio (${(pcmData.samples.byteLength / 1024).toFixed(1)}KB).`);
            } else { addSystemMessage("Could not send: WS not open."); }
          } catch (error) { addSystemMessage(`Error processing audio: ${error instanceof Error ? error.message : String(error)}`); }
        } else { addSystemMessage("No audio data collected."); }

        if (streamRef.current) { // Ensure stream is stopped
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
      };
      mediaRecorderRef.current.onerror = (event) => {
        addSystemMessage(`Recorder Error: ${(event as ErrorEvent).error?.name}`); setIsMicRecording(false); setIsAvatarAnimating(false); if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
      };
      mediaRecorderRef.current.start();
    } catch (err) {
      addSystemMessage(`Mic Error: ${err instanceof Error ? err.message : String(err)}`);
      setIsMicRecording(false); setIsAvatarAnimating(false);
    }
  };

  const handleMouseUpOnSpeakButton = () => {
    if (isMicRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop(); // This will trigger the onstop handler
    }
    setIsMicRecording(false); // Update UI immediately
    if (!isPlayingServerAudio) {
        setIsAvatarAnimating(false);
    }
  };

  // Also handle leaving the button area while mouse is down
  const handleMouseLeaveOnSpeakButton = () => {
    if (isMicRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        // console.log("Mouse left button while recording, stopping.");
        mediaRecorderRef.current.stop(); // This will trigger the onstop handler
        setIsMicRecording(false); // Update UI immediately
        if (!isPlayingServerAudio) {
            setIsAvatarAnimating(false);
        }
    }
  };

  return (
    <div className="absolute top-16 left-1/5 w-4/5 h-3/4 flex flex-col items-center justify-center dark:bg-gray-800">
      <div style={{ flexGrow: 1, width: '100%', position: 'relative', maxHeight: 'calc(100% - 120px)' }}>
        <Model isPlayingServerAudio={isPlayingServerAudio} />
      </div>

      <div style={{ padding: '20px', textAlign: 'center', width: '100%' }}>
        <button
          onMouseDown={handleMouseDownOnSpeakButton}
          onMouseUp={handleMouseUpOnSpeakButton}
          onMouseLeave={handleMouseLeaveOnSpeakButton}
          onTouchStart={handleMouseDownOnSpeakButton}
          onTouchEnd={handleMouseUpOnSpeakButton}
          disabled={wsStatus !== 'Connected' || isPlayingServerAudio}
          style={{
            padding: '15px 30px',
            fontSize: '1.2em',
            cursor: (wsStatus !== 'Connected' || isPlayingServerAudio) ? 'not-allowed' : 'pointer',
            border: 'none',
            borderRadius: '50px',
            backgroundColor: isMicRecording ? '#ef4444' : (wsStatus === 'Connected' && !isPlayingServerAudio ? '#00bcff' : '#9ca3af'),
            color: 'white',
            boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
            transition: 'background-color 0.2s ease, transform 0.1s ease',
            transform: isMicRecording ? 'scale(0.95)' : 'scale(1)',
            minWidth: '180px',
            WebkitUserSelect: 'none', /* Safari */
            MozUserSelect: 'none', /* Firefox */
            msUserSelect: 'none', /* IE10+/Edge */
            userSelect: 'none', /* Standard */
          }}
        >
          {isMicRecording ? "Listening..." : 
           (wsStatus === 'Connected' ? (isPlayingServerAudio ? "Server Speaking..." : "Hold to Speak") : 
           (wsStatus.startsWith('Connecting') ? "Connecting..." : "Connect WS"))}
        </button>
      </div>
    </div>
  );
};

export default ModelPage;