import React, { useState, useEffect, useRef, FC } from 'react';

// --- Configuration ---
const FASTAPI_AUDIO_ENDPOINT: string = 'http://localhost:8000/process_audio'; // Change if your FastAPI runs elsewhere

// --- FastAPI Response/Error Types ---
interface FastAPIAudioResponse {
    transcribed_text?: string; // If server sends back the transcription
    processed_response?: string; // If server sends a processed reply
    response?: string; // A general response field
    // Add other fields as needed
}

interface FastAPIErrorDetail {
    detail?: string;
}

const AudioProcessor: FC = () => {
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [serverResponse, setServerResponse] = useState<string>('');
    const [micError, setMicError] = useState<string>('');
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // Function to send audio data to FastAPI
    const sendAudioToFastAPI = async (audioData: Blob): Promise<void> => {
        if (!audioData) return;

        console.log('Sending audio to FastAPI...');
        setIsLoading(true);
        setServerResponse('');
        setMicError('');

        const formData = new FormData();
        // You can choose the filename and mime type.
        // Common types: 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mpeg'
        // Ensure your FastAPI backend can handle the chosen type.
        formData.append('audio_file', audioData, 'user_recording.webm');

        try {
            const response = await fetch(FASTAPI_AUDIO_ENDPOINT, {
                method: 'POST',
                body: formData, // No 'Content-Type' header needed, browser sets it for FormData
            });

            if (!response.ok) {
                let errorData: FastAPIErrorDetail = {};
                try {
                    errorData = await response.json();
                } catch (e) {
                    // If response is not JSON
                    throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
                }
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }

            const data: FastAPIAudioResponse = await response.json();
            const displayResponse = data.processed_response || data.transcribed_text || data.response || "No specific response field found.";
            setServerResponse(displayResponse);
        } catch (error: any) {
            console.error('Error sending audio to FastAPI:', error);
            setMicError(`Server Error: ${error.message}`);
            setServerResponse(''); // Clear any partial success message
        } finally {
            setIsLoading(false);
        }
    };

    const startRecording = async (): Promise<void> => {
        setMicError('');
        setServerResponse('');
        setAudioBlob(null);
        audioChunksRef.current = []; // Clear previous chunks

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setMicError("Media Devices API not supported by your browser.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setIsRecording(true);

            // Determine a supported MIME type
            let mimeType = 'audio/webm;codecs=opus'; // Preferred
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/ogg;codecs=opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/wav'; // Fallback, less compressed, ensure server can handle
                     if (!MediaRecorder.isTypeSupported(mimeType) && MediaRecorder.isTypeSupported('')) {
                        mimeType = ''; // Let the browser pick
                    } else if (!MediaRecorder.isTypeSupported(mimeType)){
                        setMicError('No supported audio MIME type found for recording.');
                        setIsRecording(false);
                        return;
                    }
                }
            }
            console.log("Using MIME type:", mimeType || "browser default");

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });

            mediaRecorderRef.current.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const completeAudioBlob = new Blob(audioChunksRef.current, { type: mimeType || audioChunksRef.current[0]?.type });
                setAudioBlob(completeAudioBlob);
                // Automatically send after stopping, or provide a separate "Send" button
                sendAudioToFastAPI(completeAudioBlob);

                // Clean up the stream tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.onerror = (event: Event) => {
                console.error('MediaRecorder error:', event);
                setMicError('Error during recording.');
                setIsRecording(false);
                 // Clean up the stream tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            console.log('Microphone access granted, recording started.');

        } catch (err: any) {
            console.error('Error accessing microphone or starting recording:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setMicError('Microphone access denied. Please enable microphone permissions.');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'){
                setMicError('No microphone found. Please ensure a microphone is connected and enabled.');
            }
            else {
                setMicError(`Error starting recording: ${err.message}`);
            }
            setIsRecording(false);
        }
    };

    const stopRecording = (): void => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop(); // This will trigger 'onstop'
            setIsRecording(false);
            console.log('Recording stopped.');
        }
    };

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            // Also, ensure any active streams are stopped if the component unmounts abruptly
            // This is partially handled in onstop/onerror but an extra check can be good.
        };
    }, []);


    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h2>Record Audio & Send to Server</h2>

            <div>
                <button onClick={startRecording} disabled={isRecording || isLoading}>
                    {isRecording ? 'Recording...' : 'Start Recording'}
                </button>
                <button onClick={stopRecording} disabled={!isRecording || isLoading} style={{ marginLeft: '10px' }}>
                    Stop Recording & Send
                </button>
            </div>

            {micError && <p style={{ color: 'red' }}>Error: {micError}</p>}
            {isLoading && <p>Processing audio with server...</p>}

            {/* Optional: Display audio player for recorded blob for testing */}
            {audioBlob && !isLoading && (
                <div style={{marginTop: '10px'}}>
                    <h4>Recorded Audio (for testing):</h4>
                    <audio controls src={URL.createObjectURL(audioBlob)} />
                </div>
            )}

            {serverResponse && (
                <div style={{marginTop: '20px'}}>
                    <h3>Server Response:</h3>
                    <p style={{ border: '1px solid #ddd', padding: '10px', background: '#e9f5ff', whiteSpace: 'pre-wrap' }}>
                        {serverResponse}
                    </p>
                </div>
            )}
        </div>
    );
};

export default AudioProcessor;