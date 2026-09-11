"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Browser-native speech-to-text via the Web Speech API
 * (SpeechRecognition / webkitSpeechRecognition) — free, no API key, no
 * server round-trip. Chrome/Edge only; other browsers get a plain note
 * instead of a broken button.
 *
 * Deliberately not a paid transcription service (Whisper etc.) for now —
 * fine for local testing, but this won't handle Hindi/regional languages
 * well. Swap in a real service later by replacing just this component.
 *
 * Untyped (`any`) throughout: the Web Speech API's TS lib coverage is
 * inconsistent across environments, and this sandbox can't run tsc to
 * confirm what's actually available — `any` sidesteps that risk entirely.
 */
export function MicButton({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const baseRef = useRef(""); // text already in the box when this listening session started
  const finalRef = useRef(""); // final chunks accumulated so far this session
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalRef.current += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      const base = baseRef.current ? baseRef.current + " " : "";
      onChangeRef.current(base + finalRef.current + interim);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, []);

  if (!supported) {
    return <span style={{ fontSize: "0.8em", color: "#888", marginLeft: 8 }}>(voice input needs Chrome or Edge)</span>;
  }

  function toggle() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      baseRef.current = value;
      finalRef.current = "";
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch {
        // Already started — ignore.
      }
    }
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={listening} style={{ marginLeft: 8 }}>
      {listening ? "⏹ Stop" : "🎤"}
    </button>
  );
}
