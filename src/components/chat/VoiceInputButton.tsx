import { useState, useRef, useCallback } from "react";
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

  const toggleListening = useCallback(() => {
    // iOS does not support Web Speech API in any browser
    if (isIOS()) {
      toast({
        title: "Voice input not available on iPhone",
        description: "Voice-to-text isn't supported on iOS. Please type your message instead.",
        variant: "destructive",
      });
      return;
    }

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

    recognition.onstart = () => {
      console.log("Speech recognition started");
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      console.log("Speech recognition result:", event.results);
      const transcript = event.results[0][0].transcript;
      console.log("Transcript:", transcript, "Confidence:", event.results[0][0].confidence);
      if (transcript.trim()) {
        onTranscript(transcript.trim());
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
      console.log("Speech recognition ended");
      setIsListening(false);
    };

    recognition.start();
  }, [isListening, onTranscript]);

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
