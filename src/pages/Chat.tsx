import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { LoganLogo } from "@/components/LoganLogo";

import { Send, Loader2, LogOut, ChevronLeft } from "lucide-react";
import { VoiceInputButton } from "@/components/chat/VoiceInputButton";
import { format } from "date-fns";
import { SymptomPicker } from "@/components/chat/SymptomPicker";
import { AnchorPicker } from "@/components/chat/AnchorPicker";
import { DatePickerInput } from "@/components/chat/DatePickerInput";
import { OnboardingProgress } from "@/components/chat/OnboardingProgress";
import { ChatCycleCircle, calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { HormoneChart } from "@/components/chat/HormoneChart";
import { SymptomMap } from "@/components/chat/SymptomMap";
import { PhaseCheatSheet } from "@/components/chat/PhaseCheatSheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrialChat } from "@/components/chat/TrialChat";
import { MessageFeedback } from "@/components/chat/MessageFeedback";
import { ConversationStarters } from "@/components/chat/ConversationStarters";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { CycleBasicsCard, HormoneBasicsCard, SymptomExplainerCard, AnchorExplainerCard, NotSureButton } from "@/components/chat/OnboardingEducation";
import { CalendarSubscribe } from "@/components/chat/CalendarSubscribe";
import { CycleForecast } from "@/components/chat/CycleForecast";

interface SymptomCategory {
  label: string;
  symptoms: string[];
}

interface SymptomCategories {
  emotional: SymptomCategory;
  physical: SymptomCategory;
  quirky: SymptomCategory;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: string;
  emoji_reaction?: string | null;
  created_at: string;
  user_id: string;
  metadata?: {
    onboarding_step?: number;
    onboarding_complete?: boolean;
    reaction_to?: string;
    input_type?: string;
    symptom_categories?: SymptomCategories;
    available_symptoms?: string[];
    has_cycle_visual?: boolean;
    visual_type?: "cycle_circle" | "hormone_chart" | "symptom_map" | "education_cycle_basics" | "education_hormones" | "education_symptoms" | "education_anchor";
    cycle_day?: number;
    cycle_phase?: string;
    cycle_length_days?: number;
    insight_type?: string;
    validated_symptoms?: string[];
    anchor_symptom?: string;
    conversation_starters?: string[];
    engagement_question?: string;
    period_checkin?: boolean;
    period_update?: boolean;
    new_period_start?: string;
    show_not_sure?: "cycle_length" | "last_period";
  };
}

interface CycleData {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart?: string;
}

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [cycleData, setCycleData] = useState<CycleData | null>(null);
  const [showForecast, setShowForecast] = useState(false);
  
  const { user, loading: authLoading, signOut } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const onboardingInitialized = useRef(false);
  const insightGenerated = useRef(false);

  // Fetch messages and initialize onboarding if needed
  useEffect(() => {
    if (!user) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        toast({ title: "Failed to load messages", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const typedMessages = (data || []).map((m) => ({
        ...m,
        role: m.role as "user" | "assistant" | "system",
        metadata: m.metadata as ChatMessage["metadata"],
      }));
      setMessages(typedMessages);
      setIsLoading(false);

      // Check if onboarding is in progress and get current step
      const hasOnboardingMessages = typedMessages.some(
        m => m.message_type === "onboarding" || m.metadata?.onboarding_step !== undefined
      );
      const isOnboardingComplete = typedMessages.some(
        m => m.metadata?.onboarding_complete === true
      );
      
      // Find the latest onboarding step
      const latestOnboardingMsg = [...typedMessages].reverse().find(
        m => m.metadata?.onboarding_step !== undefined
      );
      if (latestOnboardingMsg?.metadata?.onboarding_step !== undefined) {
        setOnboardingStep(latestOnboardingMsg.metadata.onboarding_step);
      }
      
      setIsOnboarding(hasOnboardingMessages && !isOnboardingComplete);

      // If no messages and hasn't been initialized, start onboarding
      if (typedMessages.length === 0 && !onboardingInitialized.current) {
        onboardingInitialized.current = true;
        initializeOnboarding();
      }

      // If onboarding is complete, trigger on-open insight generation (once per session)
      if (isOnboardingComplete && typedMessages.length > 0 && !insightGenerated.current) {
        insightGenerated.current = true;
        generateOnOpenInsight();
      }
    };

    fetchMessages();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("chat_messages_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newMessage = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            
            // Check if onboarding is complete
            if (newMessage.metadata?.onboarding_complete) {
              setIsOnboarding(false);
            }
            
            // Update onboarding step from new message
            if (newMessage.metadata?.onboarding_step !== undefined) {
              setOnboardingStep(newMessage.metadata.onboarding_step);
            }
            
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Extract cycle data from messages metadata and recalculate live
  useEffect(() => {
    if (!user || isOnboarding || messages.length === 0) {
      setCycleData(null);
      return;
    }

    // Find the most recent last_period_start from metadata
    // Check period update messages first, then any message with last_period_start
    let lastPeriodStart: string | null = null;
    let cycleLengthDays: number | null = null;

    // Iterate in reverse to find most recent data
    for (let i = messages.length - 1; i >= 0; i--) {
      const metadata = messages[i].metadata as any;
      if (!metadata) continue;

      // Period update messages have new_period_start
      if (metadata.new_period_start && !lastPeriodStart) {
        lastPeriodStart = metadata.new_period_start;
      }
      // Regular messages may have last_period_start
      if (metadata.last_period_start && !lastPeriodStart) {
        lastPeriodStart = metadata.last_period_start;
      }
      if (metadata.cycle_length_days && !cycleLengthDays) {
        cycleLengthDays = metadata.cycle_length_days;
      }
      if (lastPeriodStart && cycleLengthDays) break;
    }

    if (!lastPeriodStart || !cycleLengthDays) {
      // Fallback: use stale cycle_day from metadata if no period start found
      const messagesWithCycleData = messages.filter(
        (msg) => msg.metadata && (msg.metadata as any).cycle_day && (msg.metadata as any).cycle_length_days
      );
      if (messagesWithCycleData.length > 0) {
        const metadata = messagesWithCycleData[messagesWithCycleData.length - 1].metadata as any;
        setCycleData({
          cycleDay: metadata.cycle_day,
          phase: metadata.cycle_phase || "Unknown",
          cycleLengthDays: metadata.cycle_length_days,
        });
      }
      return;
    }

    // Recalculate cycle day live using the same logic as the server
    const liveInfo = calculateCycleInfo(lastPeriodStart, cycleLengthDays);
    if (liveInfo) {
      setCycleData({
        cycleDay: liveInfo.cycleDay,
        phase: liveInfo.phase,
        cycleLengthDays,
        lastPeriodStart,
      });
    }
  }, [user, isOnboarding, messages]);

  // Scroll to bottom on initial load
  const hasScrolledToBottom = useRef(false);
  useEffect(() => {
    if (messages.length > 0 && !hasScrolledToBottom.current) {
      hasScrolledToBottom.current = true;
      // Use setTimeout to ensure DOM is rendered
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "instant" });
      }, 50);
    }
  }, [messages]);

  // Auto-scroll on new user messages (if near bottom)
  useEffect(() => {
    if (messages.length === 0) return;
    if (!hasScrolledToBottom.current) return; // skip until initial scroll done
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "user") return;
    if (!isNearBottomRef.current) return;

    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateOnOpenInsight = async () => {
    try {
      const { error } = await supabase.functions.invoke("generate-insight");
      if (error) {
        console.error("Error generating on-open insight:", error);
      }
    } catch (error) {
      console.error("Error generating on-open insight:", error);
    }
  };

  const initializeOnboarding = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) return;

      const { error } = await supabase.functions.invoke("chat-onboarding", {
        body: { action: "init" },
      });

      if (error) {
        console.error("Error initializing onboarding:", error);
      } else {
        setIsOnboarding(true);
      }
    } catch (error) {
      console.error("Error initializing onboarding:", error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || !user || isSending) return;

    const messageContent = inputValue.trim();
    
    // If onboarding is complete, use AI chat; otherwise use onboarding flow
    if (!isOnboarding) {
      await sendAIMessage(messageContent);
    } else {
      await sendOnboardingResponse(messageContent);
    }
  };

  const sendAIMessage = async (messageContent: string) => {
    if (!user || isSending) return;
    
    setInputValue("");
    setIsSending(true);

    try {
      // First, insert the user's message
      const { error: insertError } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: messageContent,
        message_type: "text",
      });

      if (insertError) throw insertError;

      // Call the AI chat function
      const { data, error } = await supabase.functions.invoke("chat-ai", {
        body: { userMessage: messageContent },
      });

      if (error) {
        console.error("AI chat error:", error);
        toast({ 
          title: "Logan couldn't respond", 
          description: "Please try again in a moment.",
          variant: "destructive" 
        });
      } else if (data?.error) {
        // Handle rate limiting and other errors
        toast({ 
          title: data.error, 
          variant: "destructive" 
        });
      }

      // If period was updated, refresh cycle data from the response
      if (data?.periodUpdated && data?.cycleInfo) {
        setCycleData({
          cycleDay: data.cycleInfo.cycleDay,
          phase: data.cycleInfo.phase,
          cycleLengthDays: data.cycleInfo.cycleLengthDays || cycleData?.cycleLengthDays || 28,
        });
      }
      
      inputRef.current?.focus();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Failed to send message", variant: "destructive" });
      setInputValue(messageContent);
    } finally {
      setIsSending(false);
    }
  };

  const sendOnboardingResponse = async (
    messageContent: string,
    symptoms?: string[],
    anchor?: string,
    date?: Date,
  ) => {
    if (!user || isSending) return;
    
    setInputValue("");
    setIsSending(true);

    try {
      // First, insert the user's message
      const displayContent = symptoms 
        ? `Selected: ${symptoms.join(", ")}`
        : anchor 
          ? `Anchor symptom: ${anchor}`
          : date
            ? `Last period: ${format(date, "PPP")}`
            : messageContent;

      const { error } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: displayContent,
        message_type: "text",
      });

      if (error) throw error;

      // Trigger the onboarding response
      const body: Record<string, any> = { action: "respond", userMessage: messageContent };
      
      if (symptoms) {
        body.selectedSymptoms = symptoms;
        setSelectedSymptoms(symptoms);
      }
      if (anchor) {
        body.anchorSymptom = anchor;
      }
      if (date) {
        body.selectedDate = format(date, "yyyy-MM-dd");
      }

      const { data, error: onboardingError } = await supabase.functions.invoke("chat-onboarding", {
        body,
      });

      if (onboardingError) {
        console.error("Onboarding error:", onboardingError);
      } else if (data?.onboardingComplete) {
        setIsOnboarding(false);
      }
      
      inputRef.current?.focus();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Failed to send message", variant: "destructive" });
      setInputValue(messageContent);
    } finally {
      setIsSending(false);
    }
  };

  const handleSymptomSubmit = (symptoms: string[], additionalNotes?: string) => {
    const symptomsWithNotes = additionalNotes 
      ? `Selected symptoms: ${symptoms.join(", ")}. Additional notes: ${additionalNotes}`
      : `Selected symptoms: ${symptoms.join(", ")}`;
    sendOnboardingResponse(symptomsWithNotes, symptoms);
  };

  const handleAnchorSubmit = (anchor: string) => {
    sendOnboardingResponse(`Anchor: ${anchor}`, undefined, anchor);
  };

  const handleDateSubmit = (date: Date) => {
    sendOnboardingResponse(format(date, "PPP"), undefined, undefined, date);
  };

  const goBackToStep = async (targetStep: number) => {
    if (!user || isSending) return;
    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("chat-onboarding", {
        body: { action: "go_back", targetStep },
      });

      if (error) {
        console.error("Go back error:", error);
        toast({ title: "Couldn't go back", variant: "destructive" });
      } else {
        // Refresh messages
        const { data: freshMessages } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (freshMessages) {
          const typedMessages = freshMessages.map((m) => ({
            ...m,
            role: m.role as "user" | "assistant" | "system",
            metadata: m.metadata as ChatMessage["metadata"],
          }));
          setMessages(typedMessages);
          setOnboardingStep(targetStep);
          setIsOnboarding(true);
        }
      }
    } catch (error) {
      console.error("Go back error:", error);
    } finally {
      setIsSending(false);
    }
  };

  // Check if we should show an interactive picker instead of text input
  const shouldShowInteractivePicker = () => {
    if (!isOnboarding || messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant") return false;
    const inputType = lastMessage.metadata?.input_type;
    return inputType === "symptom_picker" || inputType === "anchor_picker" || inputType === "date_picker";
  };
  const sendFeedback = async (messageId: string, isPositive: boolean) => {
    if (!user) return;

    try {
      const emoji = isPositive ? "👍" : "👎";
      
      // Get the original message to capture context for future insights
      const originalMessage = messages.find(m => m.id === messageId);
      const messageMetadata = originalMessage?.metadata || {};
      
      // Delete any existing reaction for this message first
      await supabase
        .from("chat_messages")
        .delete()
        .eq("user_id", user.id)
        .eq("message_type", "reaction")
        .contains("metadata", { reaction_to: messageId });
      
      // Insert new reaction with context for learning
      const { error } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: emoji,
        message_type: "reaction",
        metadata: { 
          reaction_to: messageId, 
          feedback_type: isPositive ? "positive" : "negative",
          // Store context for future insight improvement
          original_cycle_day: messageMetadata.cycle_day,
          original_cycle_phase: messageMetadata.cycle_phase,
          original_insight_type: messageMetadata.insight_type,
          feedback_timestamp: new Date().toISOString(),
        },
      });

      if (error) throw error;
      
      // Show thank you message
      toast({ 
        title: "Thanks for your feedback!", 
        description: isPositive 
          ? "We'll use this to improve future insights." 
          : "We'll work on making this more helpful.",
      });
    } catch (error) {
      console.error("Error sending feedback:", error);
      toast({ title: "Failed to send feedback", variant: "destructive" });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    // Stay on the same page, UI will update to show auth form
  };

  // Show loading only while checking auth status
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show trial chat experience for unauthenticated users
  if (!user) {
    return <TrialChat />;
  }

  // Show loading while fetching messages for logged-in user
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <LoganLogo size="sm" />
             <div>
               <h1 className="font-display font-semibold text-foreground">Logan</h1>
               <p className="text-xs text-muted-foreground">
                 {isOnboarding ? "Setting up your profile" : "Your performance partner"}
               </p>
             </div>
           </div>
          <div className="flex items-center gap-3">
            {cycleData && !isOnboarding && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full">
                    <ChatCycleCircle
                      cycleDay={cycleData.cycleDay}
                      phase={cycleData.phase}
                      cycleLengthDays={cycleData.cycleLengthDays}
                      size="sm"
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">Cycle Overview</h4>
                      <span className="text-xs text-muted-foreground">
                        Day {cycleData.cycleDay} of {cycleData.cycleLengthDays}
                      </span>
                    </div>
                    
                    <ChatCycleCircle
                      cycleDay={cycleData.cycleDay}
                      phase={cycleData.phase}
                      cycleLengthDays={cycleData.cycleLengthDays}
                      size="md"
                    />
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current Phase</span>
                        <span className="font-medium">{cycleData.phase}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cycle Length</span>
                        <span className="font-medium">{cycleData.cycleLengthDays} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Days Remaining</span>
                        <span className="font-medium">{cycleData.cycleLengthDays - cycleData.cycleDay} days</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowForecast(true)}
                    >
                      View Full Forecast
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <CalendarSubscribe />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Onboarding Progress Bar */}
      {isOnboarding && (
        <div className="sticky top-0 z-20 flex items-center gap-2 bg-card/80 backdrop-blur-sm border-b border-border/50 px-4 py-2">
          <div className="max-w-3xl mx-auto w-full flex items-center gap-2">
            {onboardingStep > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goBackToStep(onboardingStep - 1)}
                disabled={isSending}
                className="text-muted-foreground hover:text-foreground gap-1 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            <div className="flex-1">
              <OnboardingProgress currentStep={onboardingStep} totalSteps={5} />
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea
        ref={scrollContainerRef}
        className="flex-1 px-4"
        onScrollCapture={(e) => {
          const el = e.currentTarget.querySelector('[data-radix-scroll-area-viewport]');
          if (el) {
            const { scrollTop, scrollHeight, clientHeight } = el;
            isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
          }
        }}
      >
        <div className="max-w-3xl mx-auto py-6 space-y-4">
          {messages.length === 0 && !isLoading ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <p className="text-muted-foreground">Starting your conversation...</p>
            </div>
          ) : (
            messages
              .filter(msg => msg.message_type !== "reaction") // Hide reaction messages from feed
              .map((message, index, filteredMessages) => {
              const isLastMessage = index === filteredMessages.length - 1;
              const inputType = message.metadata?.input_type;
              const showInteractiveInput = isLastMessage && message.role === "assistant" && isOnboarding && !isSending;

              // Find existing reaction for this message
              const existingReactionMsg = messages.find(
                m => m.message_type === "reaction" && 
                m.metadata?.reaction_to === message.id
              );
              const existingReaction = existingReactionMsg?.content === "👍" 
                ? "positive" as const
                : existingReactionMsg?.content === "👎" 
                  ? "negative" as const
                  : null;

              return (
                <div key={message.id} ref={isLastMessage ? lastMessageRef : null}>
                  <div
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`relative max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border"
                      }`}
                    >
                      {/* Cycle visual first for insight messages */}
                      {message.metadata?.has_cycle_visual && message.metadata?.cycle_day && message.metadata?.cycle_phase && (
                        <div className="mb-3">
                          {message.metadata.visual_type === "hormone_chart" ? (
                            <HormoneChart
                              cycleDay={message.metadata.cycle_day}
                              phase={message.metadata.cycle_phase}
                              cycleLengthDays={message.metadata.cycle_length_days || 28}
                            />
                          ) : message.metadata.visual_type === "symptom_map" ? (
                            <SymptomMap
                              symptoms={message.metadata.validated_symptoms as string[] | undefined}
                              anchorSymptom={message.metadata.anchor_symptom as string | undefined}
                              cycleDay={message.metadata.cycle_day}
                              cycleLengthDays={message.metadata.cycle_length_days || 28}
                              phase={message.metadata.cycle_phase}
                            />
                          ) : message.metadata.visual_type === "cycle_circle" ? (
                            <ChatCycleCircle
                              cycleDay={message.metadata.cycle_day}
                              phase={message.metadata.cycle_phase}
                              cycleLengthDays={message.metadata.cycle_length_days || 28}
                            />
                          ) : null}
                        </div>
                      )}

                      {/* Message text (intro for proactive insights) */}
                      {message.role === "assistant" ? (
                        <MarkdownMessage content={message.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}

                      {/* Education cards */}
                      {message.metadata?.visual_type === "education_cycle_basics" && (
                        <div className="mt-3"><CycleBasicsCard /></div>
                      )}
                      {message.metadata?.visual_type === "education_hormones" && (
                        <div className="mt-3"><HormoneBasicsCard /></div>
                      )}
                      {message.metadata?.visual_type === "education_symptoms" && (
                        <div className="mt-3"><SymptomExplainerCard /></div>
                      )}
                      {message.metadata?.visual_type === "education_anchor" && (
                        <div className="mt-3"><AnchorExplainerCard /></div>
                      )}

                      {/* Phase cheat sheet for proactive insights — between intro and question */}
                      {message.role === "assistant" && message.metadata?.insight_type === "proactive" && message.metadata?.cycle_day && message.metadata?.cycle_phase && (
                        <div className="mt-3">
                          <PhaseCheatSheet
                            phase={message.metadata.cycle_phase}
                            cycleDay={message.metadata.cycle_day}
                            cycleLengthDays={message.metadata.cycle_length_days || 28}
                          />
                        </div>
                      )}

                      {/* Engagement question after the cheat sheet */}
                      {message.metadata?.engagement_question && (
                        <div className="mt-3">
                          <MarkdownMessage content={message.metadata.engagement_question as string} />
                        </div>
                      )}
                      
                      <div className={`flex items-center gap-2 mt-1 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}>
                        <span className={`text-xs ${
                          message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}>
                          {format(new Date(message.created_at), "h:mm a")}
                        </span>
                        
                        {/* Thumbs up/down feedback for assistant messages */}
                        {message.role === "assistant" && !showInteractiveInput && (
                          <MessageFeedback
                            messageId={message.id}
                            onFeedback={sendFeedback}
                            existingReaction={existingReaction}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Interactive inputs for onboarding */}
                  {showInteractiveInput && inputType === "symptom_picker" && message.metadata?.symptom_categories && (
                    <div className="mt-3">
                      <SymptomPicker
                        categories={message.metadata.symptom_categories}
                        onSubmit={handleSymptomSubmit}
                        isSubmitting={isSending}
                      />
                    </div>
                  )}

                  {showInteractiveInput && inputType === "anchor_picker" && (
                    <div className="mt-3">
                      <AnchorPicker
                        symptoms={message.metadata?.available_symptoms || selectedSymptoms}
                        onSubmit={handleAnchorSubmit}
                        isSubmitting={isSending}
                      />
                    </div>
                  )}

                  {showInteractiveInput && inputType === "date_picker" && (
                    <div className="mt-3">
                      <DatePickerInput
                        onSubmit={handleDateSubmit}
                        isSubmitting={isSending}
                      />
                    </div>
                  )}

                  {/* "I'm not sure" button for cycle length and last period */}
                  {showInteractiveInput && message.metadata?.show_not_sure && (
                    <div className="mt-1 ml-1">
                      <NotSureButton
                        field={message.metadata.show_not_sure}
                        onUseDefault={() => {
                          if (message.metadata?.show_not_sure === "cycle_length") {
                            sendOnboardingResponse("28");
                          } else {
                            const twoWeeksAgo = new Date();
                            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
                            sendOnboardingResponse("About 2 weeks ago", undefined, undefined, twoWeeksAgo);
                          }
                        }}
                        disabled={isSending}
                      />
                    </div>
                  )}


                  {/* Conversation starters for proactive insights or post-onboarding prompt */}
                  {isLastMessage && 
                   message.role === "assistant" && 
                   !isOnboarding && (
                    <ConversationStarters
                      starters={
                        message.metadata?.conversation_starters && message.metadata.conversation_starters.length > 0
                          ? message.metadata.conversation_starters
                          : message.metadata?.onboarding_complete || message.metadata?.has_cycle_visual
                            ? ["What can I expect tomorrow?", "How should I plan my week?", "What's my energy like today?"]
                            : []
                      }
                      onSelect={(starter) => {
                        setInputValue(starter);
                        sendAIMessage(starter);
                      }}
                      disabled={isSending}
                    />
                  )}
                </div>
              );
            })
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input - hide when showing interactive pickers */}
      {!shouldShowInteractivePicker() && (
        <div className="border-t border-border/50 bg-card/50 backdrop-blur-sm sticky bottom-0">
          <form onSubmit={sendMessage} className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex gap-3">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isOnboarding ? "Type your answer..." : "Share an update or ask a question..."}
                className="flex-1 h-12"
                disabled={isSending}
              />
              <VoiceInputButton
                onTranscript={(text) => setInputValue(prev => prev ? `${prev} ${text}` : text)}
                disabled={isSending}
                className="h-12 w-12"
              />
              <Button 
                type="submit" 
                size="icon" 
                className="h-12 w-12"
                disabled={!inputValue.trim() || isSending}
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              {isOnboarding 
                ? "Answer Logan's questions to personalize your experience"
                : "Logan learns from your updates to personalize your insights"
              }
            </p>
          </form>
        </div>
      )}
    </div>

    {/* Cycle Forecast overlay */}
    {showForecast && cycleData && cycleData.lastPeriodStart && (
      <CycleForecast
        cycleDay={cycleData.cycleDay}
        phase={cycleData.phase}
        cycleLengthDays={cycleData.cycleLengthDays}
        lastPeriodStart={cycleData.lastPeriodStart || ""}
        onClose={() => setShowForecast(false)}
      />
    )}
    </>
  );
};

export default Chat;
