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
    const s = Math.max(-1, Math.min(1, buffer[l])); // Clamp to [-1, 1]
    output[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;   // Scale to Int16 range
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
  convertTo16Bit: boolean = true, // Kept for consistency, should be true here
  targetSampleRate?: number
): Promise<PcmData> {
  console.log("[webmToPcm] Starting conversion for blob (output will be Int16 PCM):", webmBlob);
  if (!webmBlob || !webmBlob.type.startsWith('audio/')) {
    console.warn("[webmToPcm] Blob type is not audio or blob is null. Type:", webmBlob?.type);
    throw new Error("Invalid blob type for PCM conversion");
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  let decodedAudioBuffer: AudioBuffer;

  try {
    const arrayBuffer = await blobToArrayBuffer(webmBlob);
    console.log("[webmToPcm] Blob converted to ArrayBuffer, length:", arrayBuffer.byteLength);
    decodedAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log(
      `[webmToPcm] Decoded AudioBuffer: ${decodedAudioBuffer.duration.toFixed(2)}s, ` +
      `${decodedAudioBuffer.sampleRate}Hz, ${decodedAudioBuffer.numberOfChannels}ch`
    );
  } catch (error) {
    console.error("[webmToPcm] Error decoding audio data:", error);
    await audioContext.close();
    throw error;
  }

  let finalAudioBuffer = decodedAudioBuffer;

  if (targetSampleRate && targetSampleRate !== decodedAudioBuffer.sampleRate) {
    console.log(`[webmToPcm] Resampling from ${decodedAudioBuffer.sampleRate} Hz to ${targetSampleRate} Hz`);
    // Ensure mono for resampling context if a specific channel count is desired
    const numberOfOutputChannels = 1; // Assuming we always want mono output
    const offlineContext = new OfflineAudioContext(
      numberOfOutputChannels,
      decodedAudioBuffer.duration * targetSampleRate, // Total samples at target rate
      targetSampleRate
    );

    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = decodedAudioBuffer;
    bufferSource.connect(offlineContext.destination);
    bufferSource.start();

    try {
      finalAudioBuffer = await offlineContext.startRendering();
      console.log(
        `[webmToPcm] Resampled AudioBuffer: ${finalAudioBuffer.duration.toFixed(2)}s, ` +
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
    console.log(`[webmToPcm] Source has ${numberOfChannels} channels. Mixing down to mono.`);
    const monoChannelData = new Float32Array(finalAudioBuffer.length);
    for (let i = 0; i < finalAudioBuffer.length; i++) {
      let sum = 0;
      // Ensure we don't try to access more channels than available in finalAudioBuffer
      for (let ch = 0; ch < Math.min(numberOfChannels, finalAudioBuffer.numberOfChannels); ch++) {
        sum += finalAudioBuffer.getChannelData(ch)[i];
      }
      monoChannelData[i] = sum / Math.min(numberOfChannels, finalAudioBuffer.numberOfChannels);
    }
    pcmSamplesFloat32 = monoChannelData;
  } else {
    pcmSamplesFloat32 = finalAudioBuffer.getChannelData(0);
  }
  console.log(`[webmToPcm] Extracted/Mixed mono Float32 PCM data, length: ${pcmSamplesFloat32.length}`);

  await audioContext.close();

  if (convertTo16Bit) {
    const pcmInt16 = float32ToInt16(pcmSamplesFloat32);
    console.log(`[webmToPcm] Converted to Int16 PCM data, length: ${pcmInt16.length}`);
    return {
      samples: pcmInt16,
      sampleRate: finalAudioBuffer.sampleRate,
      numberOfChannels: 1, // Output is mono
      format: 'int16',
      duration: finalAudioBuffer.duration,
    };
  } else {
    // This path shouldn't be taken given convertTo16Bit defaults to true and is hardcoded in the call
    throw new Error("webmToPcm was called expecting Float32 output, but this version is configured for Int16.");
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
  console.log(`[playPcmData] Attempting to play ${pcmArrayBuffer.byteLength} bytes of PCM at ${sampleRate}Hz.`);
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
    // onended handler in _doPlayPcmData will be called and close the context
  } else if (pcmPlaybackAudioContext && pcmPlaybackAudioContext.state !== 'closed') {
    // If sourceNode is null but context exists (e.g., playback ended naturally but stop called after)
    pcmPlaybackAudioContext.close().then(() => pcmPlaybackAudioContext = null);
  }
}
// --- End PCM Playback Helper ---


const TARGET_SAMPLE_RATE = 16000; // For recording and expecting from server

const MicTest: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [wsStatus, setWsStatus] = useState<string>("Disconnected");
  const [systemMessages, setSystemMessages] = useState<string[]>([]); // Only system/status messages
  const [isPlayingServerAudio, setIsPlayingServerAudio] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const addSystemMessage = (content: string) => {
    setSystemMessages(prev => [...prev, content]);
  };

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const ws_url = `ws://localhost:8000/stream/test/vad/123`;
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
        addSystemMessage(`Received ${event.data.byteLength} bytes of audio data.`);
        console.log(`[WebSocket] Received audio ArrayBuffer, size: ${event.data.byteLength}`);
        if (event.data.byteLength > 0) {
          setIsPlayingServerAudio(true);
          playPcmData(event.data, TARGET_SAMPLE_RATE, () => {
            setIsPlayingServerAudio(false);
          });
        } else {
          addSystemMessage("Received empty audio buffer.");
        }
      } else if (typeof event.data === 'string') {
        // If server *might* send JSON status/error messages (even if not regular chat)
        try {
          const packet = JSON.parse(event.data);
          console.log("[WebSocket] Received JSON packet:", packet);
          if (packet.error) {
            addSystemMessage(`Server Error: ${packet.error}`);
          } else if (packet.status) {
            addSystemMessage(`Server Status: ${packet.status}`);
          } else {
            addSystemMessage(`Received Text/JSON: ${event.data}`);
          }
        } catch (e) {
          addSystemMessage(`Received Text: ${event.data}`); // Non-JSON string
          console.log("[WebSocket] Received non-JSON text message:", event.data);
        }
      } else {
        console.warn("[WebSocket] Received unknown data type:", event.data);
        addSystemMessage("Received unknown data type from server.");
      }
    };

    ws.onclose = (event) => {
      setWsStatus(`Closed: ${event.reason || 'No reason'}`);
      addSystemMessage(`WebSocket connection closed. Code: ${event.code}. Reconnecting...`);
      wsRef.current = null;
      setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      setWsStatus("Error");
      addSystemMessage("WebSocket error.");
    };
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      stopPcmDataPlayback();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
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
    addSystemMessage("Recording started...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn(`${options.mimeType} not supported, trying default.`);
        delete (options as any).mimeType;
      }
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = async () => {
        addSystemMessage("Recording stopped. Processing and sending...");
        const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType || 'audio/webm' });
        if (audioBlob.size > 0) {
          try {
            const pcmData = await webmToPcm(audioBlob, true, TARGET_SAMPLE_RATE);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(pcmData.samples.buffer);
              addSystemMessage(`Sent ${pcmData.samples.byteLength} bytes of audio.`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Error processing or sending audio:", error);
            addSystemMessage(`Error processing audio: ${errorMessage}`);
          }
        }
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Error starting recording:", err);
      addSystemMessage(`Error starting recording: ${errorMessage}`);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '600px', margin: 'auto' }}>
      <h2>Audio Streaming with WebSocket</h2>
      <p style={{ fontSize: '0.8em', color: '#555' }}>Status: {wsStatus}</p>

      <div>
        <button onClick={startRecording} disabled={isRecording || wsStatus !== 'Connected'} style={{ marginRight: '10px', padding: '10px' }}>
          Start Recording
        </button>
        <button onClick={stopRecording} disabled={!isRecording} style={{ padding: '10px' }}>
          Stop Recording
        </button>
      </div>

      <div style={{ marginTop: '20px', height: '300px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', background: '#f9f9f9' }}>
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