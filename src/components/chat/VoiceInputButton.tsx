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
  const finalTranscriptRef = useRef("");
  const isIOSDevice = useMemo(() => isIOS(), []);

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
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    deliveredRef.current = false;
    finalTranscriptRef.current = "";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      // Some mobile browsers (notably Android Chrome) fire onresult multiple
      // times with cumulative transcripts even when interimResults=false.
      // Collect only final results and keep the longest snapshot — we deliver
      // once in onend to avoid duplicated/stuttered appends.
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += (finalText ? " " : "") + result[0].transcript;
        }
      }
      if (finalText.length > finalTranscriptRef.current.length) {
        finalTranscriptRef.current = finalText;
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error, event.message);
      if (event.error === "not-allowed") {
        toast({
          title: "Microphone access denied",
          description: "Please allow microphone access in your browser settings.",
          variant: "destructive",
        });
      } else if (event.error === "no-speech") {
        toast({
          title: "No speech detected",
          description: "Try speaking louder or closer to your microphone.",
        });
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const text = finalTranscriptRef.current.trim();
      if (text && !deliveredRef.current) {
        deliveredRef.current = true;
        onTranscript(text);
      }
    };

    recognition.start();
  }, [isListening, onTranscript]);

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
