import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeWeek } from '../api';

/** Long enough to describe a week; short enough that a forgotten mic stops itself. */
export const MAX_RECORDING_SECONDS = 120;

export type RecorderState = 'idle' | 'recording' | 'transcribing';

export const isVoiceSupported = (): boolean =>
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

/** Safari records mp4, Firefox ogg, Chrome webm — Whisper wants to know which. */
const filenameFor = (mimeType: string): string => {
    if (mimeType.includes('mp4')) return 'recording.mp4';
    if (mimeType.includes('ogg')) return 'recording.ogg';
    return 'recording.webm';
};

/**
 * Record from the microphone, then turn the recording into text.
 *
 * The text is handed to `onText` rather than straight to the model, so a
 * misheard "nine" can be fixed in the box before anything reads it as a time.
 */
export const useVoiceRecorder = (onText: (text: string) => void) => {
    const [state, setState] = useState<RecorderState>('idle');
    const [seconds, setSeconds] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Kept in a ref so a new onText each render doesn't restart anything.
    const onTextRef = useRef(onText);
    onTextRef.current = onText;

    const releaseMic = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const stop = useCallback(() => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, []);

    const start = useCallback(async () => {
        setError(null);
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            const blocked = err instanceof DOMException && err.name === 'NotAllowedError';
            setError(
                blocked
                    ? 'Microphone access is blocked. Allow it in your browser, or type instead.'
                    : "Couldn't find a microphone. Type your week instead.",
            );
            return;
        }

        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        const chunks: Blob[] = [];

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstop = async () => {
            releaseMic();
            const mimeType = recorder.mimeType || 'audio/webm';
            const audio = new Blob(chunks, { type: mimeType });
            if (audio.size === 0) {
                setState('idle');
                setError("That recording was empty. Try again.");
                return;
            }

            setState('transcribing');
            try {
                const { text } = await transcribeWeek(audio, filenameFor(mimeType));
                onTextRef.current(text);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't make out that recording.");
            } finally {
                setState('idle');
            }
        };

        recorder.start();
        setSeconds(0);
        setState('recording');
        timerRef.current = setInterval(() => {
            setSeconds((s) => {
                if (s + 1 >= MAX_RECORDING_SECONDS) recorder.stop();
                return s + 1;
            });
        }, 1000);
    }, [releaseMic]);

    // Leaving the page mid-recording must not leave the mic light on.
    useEffect(
        () => () => {
            if (recorderRef.current?.state === 'recording') {
                recorderRef.current.onstop = null;
                recorderRef.current.stop();
            }
            releaseMic();
        },
        [releaseMic],
    );

    return { state, seconds, error, start, stop };
};
