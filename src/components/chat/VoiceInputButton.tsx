import { useState, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// Detect iOS — Web Speech API is not supported on any iOS browser
const isIOS = () => {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export const VoiceInputButton = ({ onTranscript, disabled, className }: VoiceInputButtonProps) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const deliveredRef = useRef(false);
  // True only while the user wants dictation to continue. The stop button is
  // the sole terminating action; any other onend (Android Chrome pauses,
  // no-speech timeouts) triggers an automatic restart.
  const wantListeningRef = useRef(false);
  // Committed (final) transcript accumulated across restarts.
  const finalTranscriptRef = useRef("");
  const isIOSDevice = useMemo(() => isIOS(), []);

  const startRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    // Continuous + interim: keep the session alive across natural pauses and
    // surface partial text so long dictations aren't truncated.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      // Each restart begins a fresh result list. Only append results from
      // resultIndex onward so already-committed finals aren't duplicated.
      let newFinal = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinal += result[0].transcript;
        }
      }
      if (newFinal) {
        finalTranscriptRef.current += newFinal;
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error, event.message);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        // Dead permission — stop the session, don't loop-restart.
        wantListeningRef.current = false;
        toast({
          title: "Microphone access denied",
          description: "Please allow microphone access in your browser settings.",
          variant: "destructive",
        });
      } else if (event.error === "no-speech") {
        // Transient pause — handled as a restart in onend while the user
        // still wants to dictate.
      } else if (event.error === "audio-capture") {
        wantListeningRef.current = false;
        toast({
          title: "Microphone unavailable",
          description: "Check that your microphone is connected and not in use by another app.",
          variant: "destructive",
        });
      } else if (event.error === "network") {
        wantListeningRef.current = false;
        toast({
          title: "Voice input connection error",
          description: "Check your internet connection and try again.",
          variant: "destructive",
        });
      }
    };

    recognition.onend = () => {
      if (wantListeningRef.current) {
        // User hasn't tapped stop — restart immediately (Android Chrome ends
        // the session after a pause even in continuous mode).
        try {
          startRecognition();
        } catch (e) {
          console.error("Speech recognition restart failed:", e);
          wantListeningRef.current = false;
          setIsListening(false);
        }
        return;
      }
      setIsListening(false);
      const text = finalTranscriptRef.current.trim().replace(/\s+/g, " ");
      if (text && !deliveredRef.current) {
        deliveredRef.current = true;
        onTranscript(text);
      }
    };

    recognition.start();
  }, [onTranscript]);

  const toggleListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast({
        title: "Voice input not supported",
        description: "Your browser doesn't support speech recognition. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      // Explicit stop — the sole terminating action. No restart fires after this.
      wantListeningRef.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    wantListeningRef.current = true;
    deliveredRef.current = false;
    finalTranscriptRef.current = "";
    try {
      startRecognition();
    } catch (e) {
      console.error("Speech recognition start failed:", e);
      wantListeningRef.current = false;
    }
  }, [isListening, startRecognition]);

  if (isIOSDevice) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant={isListening ? "default" : "outline"}
      className={`shrink-0 ${isListening ? "bg-destructive hover:bg-destructive/90 animate-pulse" : ""} ${className || ""}`}
      onClick={toggleListening}
      disabled={disabled}
      aria-label={isListening ? "Stop listening" : "Voice input"}
    >
      {isListening ? (
        <MicOff className="w-5 h-5" />
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </Button>
  );
};
