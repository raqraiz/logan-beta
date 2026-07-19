import { useState, useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { LoganLogo } from "@/components/LoganLogo";

import { Send, Loader2, LogOut, ChevronLeft, ChevronRight, ArrowDown, MessageSquarePlus, MessageCircle, Settings as SettingsIcon, Paperclip, Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { FeedbackModal } from "@/components/chat/FeedbackModal";
import { SettingsDialog } from "@/components/chat/SettingsDialog";
import { HistoryImportDialog } from "@/components/chat/HistoryImportDialog";
import { VoiceInputButton } from "@/components/chat/VoiceInputButton";
import { format } from "date-fns";
import { SymptomPicker } from "@/components/chat/SymptomPicker";
import { AnchorPicker } from "@/components/chat/AnchorPicker";
import { DatePickerInput } from "@/components/chat/DatePickerInput";
import { OnboardingProgress } from "@/components/chat/OnboardingProgress";
import { ChatCycleCircle, calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { inferCycleLengthForDeclaredPhase, autoCycleLengthFromHistory } from "@/lib/cyclePhase";
import { HormoneChart } from "@/components/chat/HormoneChart";
import { SymptomMap } from "@/components/chat/SymptomMap";
import { PhaseCheatSheet } from "@/components/chat/PhaseCheatSheet";

import { TrialChat } from "@/components/chat/TrialChat";
import { MessageFeedback } from "@/components/chat/MessageFeedback";
import { ConversationStarters } from "@/components/chat/ConversationStarters";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { HighlightedText } from "@/components/chat/HighlightedText";
import { CycleBasicsCard, HormoneBasicsCard, SymptomExplainerCard, AnchorExplainerCard, NotSureButton } from "@/components/chat/OnboardingEducation";
import { TopicPicker } from "@/components/chat/TopicPicker";

import { CycleForecast } from "@/components/chat/CycleForecast";
import { CreditBalance } from "@/components/chat/CreditBalance";
import { OutOfCredits } from "@/components/chat/OutOfCredits";
import { ResourceOfferCard, ResourceCard } from "@/components/chat/ResourceCards";
import { InstallPWABanner } from "@/components/chat/InstallPWABanner";
import { BottomTabBar, type TabId } from "@/components/tabs/BottomTabBar";
import { HomeTab } from "@/components/tabs/HomeTab";
import { PlanTab } from "@/components/tabs/PlanTab";
import { usePresence } from "@/hooks/usePresence";
import { useActivityTracker } from "@/hooks/useActivityTracker";
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
    timezone?: string | null;
    insight_type?: string;
    validated_symptoms?: string[];
    anchor_symptom?: string;
    conversation_starters?: string[];
    engagement_question?: string;
    period_checkin?: boolean;
    period_update?: boolean;
    new_period_start?: string;
    show_not_sure?: "cycle_length" | "last_period" | "irregular_last_period";
    cheat_sheet?: {
      energy?: { level: string; note: string };
      focus?: { level: string; note: string };
      emotions?: { level: string; note: string };
      nutrition?: { level: string; note: string };
    } | null;
    cheat_sheet_responses?: Record<string, string>;
    resource_type?: string;
    resource_id?: string;
    broadcast?: boolean;
    broadcast_title?: string | null;
    broadcast_id?: string | null;
    broadcast_cta?: {
      label: string;
      tab: "home" | "ask" | "plan";
      plan_section?: "mood" | "exercise" | "nutrition" | null;
    };
  };
}

interface CycleData {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart?: string;
  currentPeriodEndDate?: string | null;
  lifeStage?: "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant";
  postpartumStartDate?: string;
  postpartumActive?: boolean;
  lossDate?: string;
  dueDate?: string;
  pregnancyLmp?: string;
  needsPeriodStart?: boolean;
}

const MESSAGES_PER_PAGE = 100;

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [cycleData, setCycleData] = useState<CycleData | null>(null);
  const [lifeStage, setLifeStage] = useState<"cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant">("cycling");
  const [postpartumStartDate, setPostpartumStartDate] = useState<string | null>(null);
  const [postpartumActive, setPostpartumActive] = useState<boolean>(false);
  const [lossDate, setLossDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [pregnancyLmp, setPregnancyLmp] = useState<string | null>(null);
  // Authoritative cycle data from `participants` table — wins over chat metadata
  const [participantCycle, setParticipantCycle] = useState<{
    lastPeriodStart: string | null;
    cycleLengthDays: number | null;
    timezone: string | null;
    currentPeriodEndDate: string | null;
    periodPendingSince: string | null;
    periodStillActive: boolean;
  } | null>(null);
  const [showForecast, setShowForecast] = useState(false);
  
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [creditBalance, setCreditBalance] = useState<{ free: number; paid: number; total: number; hoursUntilReset?: number } | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showTopicPrompt, setShowTopicPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("ask");
  const [visibleStarters, setVisibleStarters] = useState<string[]>([]);
  const [usedStarters, setUsedStarters] = useState<string[]>([]);

  // Chat search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);
  
  const { user, loading: authLoading, signOut } = useAuth();
  usePresence(user?.id, user?.email || undefined, user?.user_metadata?.full_name);
  const { trackTabSwitch, trackPageView } = useActivityTracker(user?.id);

  // Track initial page view
  useEffect(() => {
    trackPageView(window.location.pathname);
  }, [trackPageView]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const onboardingInitialized = useRef(false);
  const insightGenerated = useRef(false);
  const topicPromptChecked = useRef(false);
  const SCROLL_NEAR_BOTTOM_PX = 80;
  const SCROLL_BUTTON_SHOW_PX = 48;

  const refreshMessages = async (currentUserId: string, attempt = 0): Promise<ChatMessage[]> => {
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId);

    const totalCount = count || 0;
    const offset = Math.max(0, totalCount - MESSAGES_PER_PAGE);

    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: true })
      .range(offset, offset + MESSAGES_PER_PAGE - 1);

    if (error) {
      console.error("Error fetching messages:", error);
      // Transient network failure (Safari "Load failed" during navigation) → retry silently
      const isTransient = (error as any)?.message?.includes("Load failed") || (error as any)?.message?.includes("Failed to fetch");
      if (isTransient && attempt < 2) {
        await new Promise((r) => setTimeout(r, 400));
        return refreshMessages(currentUserId, attempt + 1);
      }
      toast({ title: "Failed to load messages", variant: "destructive" });
      setIsLoading(false);
      return [] as ChatMessage[];
    }

    const typedMessages = (data || []).map((m) => ({
      ...m,
      role: m.role as "user" | "assistant" | "system",
      metadata: m.metadata as ChatMessage["metadata"],
    }));

    setMessages(typedMessages);
    setHasOlderMessages(offset > 0);
    setIsLoading(false);

    const hasOnboardingMessages = typedMessages.some(
      m => m.message_type === "onboarding" || m.metadata?.onboarding_step !== undefined
    );
    const isOnboardingComplete = typedMessages.some(
      m => m.metadata?.onboarding_complete === true
    );
    const inferredComplete = !hasOnboardingMessages && typedMessages.length > 0;
    const effectivelyComplete = isOnboardingComplete || inferredComplete;

    const latestOnboardingMsg = [...typedMessages].reverse().find(
      m => m.metadata?.onboarding_step !== undefined
    );
    if (latestOnboardingMsg?.metadata?.onboarding_step !== undefined) {
      setOnboardingStep(latestOnboardingMsg.metadata.onboarding_step);
    }

    setIsOnboarding(hasOnboardingMessages && !isOnboardingComplete);

    if (typedMessages.length === 0 && !onboardingInitialized.current) {
      onboardingInitialized.current = true;
      initializeOnboarding();
    }

    if (effectivelyComplete && typedMessages.length > 0 && !insightGenerated.current) {
      insightGenerated.current = true;
      generateOnOpenInsight();
    }

    if (effectivelyComplete) {
      fetchCredits();
      fetchLifeStage();
    }

    if (effectivelyComplete && !showTopicPrompt && !topicPromptChecked.current) {
      checkTopicPreferences();
    }

    return typedMessages;
  };

  // Fetch messages and initialize onboarding if needed
  useEffect(() => {
    if (!user) return;

    refreshMessages(user.id);

    const channel = supabase
      .channel("chat_messages_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedMessage = payload.old as Partial<ChatMessage>;
            setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));
            return;
          }

          const incomingMessage = payload.new as ChatMessage;
          setMessages((prev) => {
            if (incomingMessage.metadata?.onboarding_complete) {
              setIsOnboarding(false);
            }

            if (incomingMessage.metadata?.onboarding_step !== undefined) {
              setOnboardingStep(incomingMessage.metadata.onboarding_step);
            }

            const existingIdx = prev.findIndex((m) => m.id === incomingMessage.id);
            if (existingIdx !== -1) {
              const updated = [...prev];
              updated[existingIdx] = incomingMessage;
              return updated;
            }

            const fallbackIdx = prev.findIndex(
              (m) => m.id.startsWith("fallback-") && m.role === incomingMessage.role && m.content === incomingMessage.content
            );
            if (fallbackIdx !== -1) {
              const updated = [...prev];
              updated[fallbackIdx] = incomingMessage;
              return updated;
            }

            return [...prev, incomingMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Subscribe to authoritative participant cycle data so all tabs sync
  // when last_period_start / cycle_length_days change (from chat, date picker, admin, etc.)
  useEffect(() => {
    if (!user?.email) return;

    const channel = supabase
      .channel("participants_cycle_sync")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "participants",
          filter: `email=eq.${user.email}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          setParticipantCycle({
            lastPeriodStart: row.last_period_start ?? null,
            cycleLengthDays: row.cycle_length_days ?? null,
            timezone: row.timezone ?? null,
            currentPeriodEndDate: row.current_period_end_date ?? null,
            periodPendingSince: row.period_pending_since ?? null,
            periodStillActive: !!row.period_still_active,
          });
          if (row.life_stage) {
            setLifeStage(row.life_stage as "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant");
          }
          if (row.postpartum_start_date !== undefined) {
            setPostpartumStartDate(row.postpartum_start_date ?? null);
          }
          if (row.postpartum_active !== undefined) {
            setPostpartumActive(!!row.postpartum_active);
          }
          if (row.loss_date !== undefined) {
            setLossDate(row.loss_date ?? null);
          }
          if ((row as any).due_date !== undefined) {
            setDueDate((row as any).due_date ?? null);
          }
          if ((row as any).pregnancy_lmp !== undefined) {
            setPregnancyLmp((row as any).pregnancy_lmp ?? null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.email]);

  // Extract cycle data — participants table is authoritative; chat metadata is fallback
  useEffect(() => {
    if (!user || isOnboarding || messages.length === 0) {
      setCycleData(null);
      return;
    }

    // For postpartum/menopause/pregnancy_loss/pregnant users, provide a minimal CycleData with life stage info.
    // Irregular users still get full cycle tracking (they have cycles, just unpredictable).
    if (lifeStage === "postpartum" || lifeStage === "menopause" || lifeStage === "pregnancy_loss" || lifeStage === "pregnant") {
      setCycleData({
        cycleDay: 0,
        phase: lifeStage === "postpartum" ? "Postpartum" : lifeStage === "menopause" ? "Menopause" : lifeStage === "pregnant" ? "Pregnant" : "Recovery",
        cycleLengthDays: 0,
        lifeStage,
        postpartumStartDate: postpartumStartDate || undefined,
        lossDate: lossDate || undefined,
        dueDate: dueDate || undefined,
        pregnancyLmp: pregnancyLmp || undefined,
      });
      return;
    }

    // 1) Authoritative source: participants table
    let lastPeriodStart: string | null = participantCycle?.lastPeriodStart ?? null;
    let cycleLengthDays: number | null = participantCycle?.cycleLengthDays ?? null;
    let userTimezone: string | null = participantCycle?.timezone ?? null;

    // 1b) Prefer a more recent period start from chat metadata (e.g., user just
    // told Logan "I'm on day 38" → chat-ai writes new_period_start). The
    // participants table can lag behind realtime chat updates by a tick.
    for (let i = messages.length - 1; i >= 0; i--) {
      const metadata = messages[i].metadata as any;
      if (!metadata) continue;
      const candidate = metadata.new_period_start || metadata.last_period_start;
      if (candidate) {
        if (!lastPeriodStart || candidate > lastPeriodStart) {
          lastPeriodStart = candidate;
        }
        break;
      }
    }

    // 2) Fallback to most recent values from chat metadata for missing fields
    if (!cycleLengthDays || !userTimezone) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const metadata = messages[i].metadata as any;
        if (!metadata) continue;
        if (metadata.cycle_length_days && !cycleLengthDays) {
          cycleLengthDays = metadata.cycle_length_days;
        }
        if (metadata.timezone && !userTimezone) {
          userTimezone = metadata.timezone;
        }
        if (cycleLengthDays && userTimezone) break;
      }
    }


    const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!lastPeriodStart || !cycleLengthDays) {
      const messagesWithCycleData = messages.filter(
        (msg) => msg.metadata && (msg.metadata as any).cycle_day && (msg.metadata as any).cycle_length_days
      );
      if (messagesWithCycleData.length > 0) {
        const metadata = messagesWithCycleData[messagesWithCycleData.length - 1].metadata as any;
        setCycleData({
          cycleDay: metadata.cycle_day,
          phase: metadata.cycle_phase || "Unknown",
          cycleLengthDays: metadata.cycle_length_days,
          lifeStage: lifeStage === "irregular" ? "irregular" : "cycling",
        });
        return;
      }
      // Cycling user with no period start on file — prompt her to add it on Home
      setCycleData({
        cycleDay: 0,
        phase: "Unknown",
        cycleLengthDays: cycleLengthDays || 28,
        lifeStage: lifeStage === "irregular" ? "irregular" : "cycling",
        needsPeriodStart: true,
      });
      return;
    }

    const liveInfo = calculateCycleInfo(lastPeriodStart, cycleLengthDays, timezone, undefined, participantCycle?.currentPeriodEndDate ?? null, !!participantCycle?.periodPendingSince, !!participantCycle?.periodStillActive);
    if (liveInfo) {
      setCycleData({
        cycleDay: liveInfo.cycleDay,
        phase: liveInfo.phase,
        cycleLengthDays,
        lastPeriodStart,
        currentPeriodEndDate: participantCycle?.currentPeriodEndDate ?? null,
        lifeStage: lifeStage === "irregular" ? "irregular" : "cycling",
        postpartumStartDate: postpartumStartDate || undefined,
        postpartumActive: postpartumActive && !!postpartumStartDate,
      });
    }
  }, [user, isOnboarding, messages, lifeStage, postpartumStartDate, postpartumActive, lossDate, dueDate, pregnancyLmp, participantCycle]);

  // Scroll to bottom on initial load
  const hasScrolledToBottom = useRef(false);
  useEffect(() => {
    if (isOnboarding) return; // Disable auto-scroll during onboarding — let users read at their own pace
    if (messages.length > 0 && !hasScrolledToBottom.current) {
      hasScrolledToBottom.current = true;
      // Use setTimeout to ensure DOM is rendered
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "instant" });
      }, 50);
    }
  }, [messages, isOnboarding]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOnboarding) return; // Disable auto-scroll during onboarding — let users read at their own pace
    if (messages.length === 0) return;
    if (!hasScrolledToBottom.current) return; // skip until initial scroll done
    const lastMsg = messages[messages.length - 1];

    if (lastMsg.role === "assistant") {
      // Scroll to the START of the new assistant message so the user reads from the top
      requestAnimationFrame(() => {
        lastMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    // For user messages, only auto-scroll to bottom if already near bottom
    if (lastMsg.role === "user" && isNearBottomRef.current) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOnboarding]);

  // Track scroll position reliably for "jump to bottom" visibility
  useEffect(() => {
    const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;

    const updateScrollState = () => {
      const hasViewportScroll = !!viewport && viewport.scrollHeight > viewport.clientHeight + 1;

      const distanceFromBottom = hasViewportScroll
        ? viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
        : document.documentElement.scrollHeight - window.scrollY - window.innerHeight;

      isNearBottomRef.current = distanceFromBottom < SCROLL_NEAR_BOTTOM_PX;
      setShowScrollButton(distanceFromBottom > SCROLL_BUTTON_SHOW_PX);
    };

    updateScrollState();
    viewport?.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("scroll", updateScrollState, { passive: true });

    return () => {
      viewport?.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("scroll", updateScrollState);
    };
  }, [messages.length, SCROLL_BUTTON_SHOW_PX, SCROLL_NEAR_BOTTOM_PX]);

  const loadOlderMessages = async () => {
    if (!user || isLoadingOlder || !hasOlderMessages || messages.length === 0) return;
    
    setIsLoadingOlder(true);
    const oldestMessage = messages[0];
    
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .lt("created_at", oldestMessage.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGES_PER_PAGE);

    if (error) {
      console.error("Error loading older messages:", error);
      setIsLoadingOlder(false);
      return;
    }

    const olderMessages = (data || []).reverse().map((m) => ({
      ...m,
      role: m.role as "user" | "assistant" | "system",
      metadata: m.metadata as ChatMessage["metadata"],
    }));

    if (olderMessages.length < MESSAGES_PER_PAGE) {
      setHasOlderMessages(false);
    }

    if (olderMessages.length > 0) {
      // Preserve scroll position by measuring before and after
      const viewport = scrollContainerRef.current?.querySelector(
        '[data-radix-scroll-area-viewport]'
      ) as HTMLDivElement | null;
      const prevScrollHeight = viewport?.scrollHeight || 0;

      setMessages(prev => [...olderMessages, ...prev]);

      // After React renders, restore scroll position
      requestAnimationFrame(() => {
        if (viewport) {
          const newScrollHeight = viewport.scrollHeight;
          viewport.scrollTop = newScrollHeight - prevScrollHeight;
        }
      });
    }

    setIsLoadingOlder(false);
  };

  const fetchCredits = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-credits");
      if (!error && data && !data.error) {
        setCreditBalance({ free: data.free, paid: data.paid, total: data.total, hoursUntilReset: data.hoursUntilReset });
        setOutOfCredits(data.total <= 0);
      }
    } catch (e) {
      console.error("Error fetching credits:", e);
    }
  };

  const generateOnOpenInsight = async () => {
    try {
      // Ensure we have a fresh access token (auto-refreshes if expired)
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        // Not signed in yet; skip silently
        return;
      }
      const { error } = await supabase.functions.invoke("generate-insight", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        console.error("Error generating on-open insight:", error);
      }
    } catch (error) {
      console.error("Error generating on-open insight:", error);
    }
  };

  const fetchLifeStage = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("participants")
        .select("life_stage, postpartum_start_date, postpartum_active, loss_date, due_date, pregnancy_lmp, last_period_start, cycle_length_days, timezone, current_period_end_date, period_pending_since, period_still_active")
        .eq("email", user.email)
        .single();
      if (data?.life_stage) {
        setLifeStage(data.life_stage as "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant");
      }
      if (data?.postpartum_start_date) {
        setPostpartumStartDate(data.postpartum_start_date);
      }
      if ((data as any)?.postpartum_active !== undefined) {
        setPostpartumActive(!!(data as any).postpartum_active);
      }
      if ((data as any)?.loss_date !== undefined) {
        setLossDate((data as any).loss_date ?? null);
      }
      if ((data as any)?.due_date !== undefined) {
        setDueDate((data as any).due_date ?? null);
      }
      if ((data as any)?.pregnancy_lmp !== undefined) {
        setPregnancyLmp((data as any).pregnancy_lmp ?? null);
      }
      if (data) {
        let effectiveTimezone: string | null = data.timezone ?? null;
        // Silent one-time backfill: if the user has no timezone set, detect and persist.
        if (!effectiveTimezone) {
          try {
            const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (detected) {
              const { error: tzErr } = await supabase
                .from("participants")
                .update({ timezone: detected })
                .eq("email", user.email!)
                .is("timezone", null);
              if (!tzErr) effectiveTimezone = detected;
            }
          } catch (e) {
            // Non-fatal — cycle logic falls back to browser tz elsewhere.
          }
        }
        setParticipantCycle({
          lastPeriodStart: data.last_period_start ?? null,
          cycleLengthDays: data.cycle_length_days ?? null,
          timezone: effectiveTimezone,
          currentPeriodEndDate: (data as any).current_period_end_date ?? null,
          periodPendingSince: (data as any).period_pending_since ?? null,
          periodStillActive: !!(data as any).period_still_active,
        });
      }
    } catch (e) {
      // Participant may not exist yet
    }
  };

  const checkTopicPreferences = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.functions.invoke("chat-onboarding", {
        body: { action: "check_topics" },
      });

      if (error) {
        topicPromptChecked.current = false;
        throw error;
      }

      topicPromptChecked.current = true;

      if (data?.needsTopics) {
        setShowTopicPrompt(true);
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 300);
      }
    } catch (e) {
      topicPromptChecked.current = false;
      console.error("Error checking topic preferences:", e);
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

  const handleCheatSheetResponse = async (messageId: string, dimension: string, response: string) => {
    if (!user) return;
    
    // Update local message state with the response
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const existingResponses = (msg.metadata?.cheat_sheet_responses as Record<string, string>) || {};
        return {
          ...msg,
          metadata: {
            ...msg.metadata,
            cheat_sheet_responses: { ...existingResponses, [dimension]: response },
          },
        };
      }
      return msg;
    }));

    // Store as a silent user message with metadata for personalization
    try {
      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: `[check-in] ${dimension}: ${response}`,
        message_type: "checkin",
        metadata: {
          checkin_type: "cheat_sheet",
          dimension,
          response,
          phase: messages.find(m => m.id === messageId)?.metadata?.cycle_phase,
          cycle_day: messages.find(m => m.id === messageId)?.metadata?.cycle_day,
          parent_insight_id: messageId,
        },
      });
    } catch (err) {
      console.error("Failed to store cheat sheet response:", err);
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

    // Optimistically add the user message so it appears immediately
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      role: "user",
      content: messageContent,
      message_type: "text",
      created_at: new Date().toISOString(),
      user_id: user.id,
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      // Insert the user's message into the database
      const { data: insertedRow, error: insertError } = await supabase
        .from("chat_messages")
        .insert({
          user_id: user.id,
          role: "user",
          content: messageContent,
          message_type: "text",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Replace optimistic message with the real one (so realtime dedup works)
      if (insertedRow) {
        setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: insertedRow.id } : m));
      }

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
      } else if (data?.error === "no_credits") {
        setOutOfCredits(true);
        fetchCredits();
      } else if (data?.error) {
        toast({ 
          title: data.error, 
          variant: "destructive" 
        });
      } else if (data?.message) {
        const fallbackMsg: ChatMessage = {
          id: `fallback-${Date.now()}`,
          role: "assistant",
          content: data.message,
          message_type: "text",
          created_at: new Date().toISOString(),
          user_id: user.id,
        };
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.content === data.message) return prev;
          return [...prev, fallbackMsg];
        });
      }

      if (data?.creditBalance) {
        setCreditBalance({
          free: data.creditBalance.free,
          paid: data.creditBalance.paid,
          total: data.creditBalance.total,
        });
        setOutOfCredits(data.creditBalance.total <= 0);
      }

      if ((data?.periodUpdated || data?.cycleLengthUpdated) && data?.cycleInfo) {
        setCycleData({
          cycleDay: data.cycleInfo.cycleDay,
          phase: data.cycleInfo.phase,
          cycleLengthDays: data.cycleInfo.cycleLengthDays || cycleData?.cycleLengthDays || 28,
        });
        // Pull authoritative values from the DB so every tab stays in sync
        fetchLifeStage();
        // Broadcast so HomeTab / PlanTab / CycleForecast invalidate their own caches.
        window.dispatchEvent(new CustomEvent("cycle-data-updated", {
          detail: { source: "chat-correction", cycleInfo: data.cycleInfo }
        }));
      }

      await refreshMessages(user.id);
      // Always re-pull participant cycle in case the AI silently updated it
      fetchLifeStage();
      inputRef.current?.focus();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Failed to send message", variant: "destructive" });
      // Remove optimistic message and restore input
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
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
            ? `${lifeStage === "postpartum" ? "Birth date" : "Last period"}: ${format(date, "PPP")}`
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
      } else {
        await refreshMessages(user.id);
        if (data?.onboardingComplete) {
          setIsOnboarding(false);
        }
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

  const handleTopicSubmit = (topics: string[]) => {
    const body: Record<string, any> = { action: "respond", userMessage: `Topics: ${topics.join(", ")}`, selectedTopics: topics };
    sendOnboardingResponseWithBody(`Focus areas: ${topics.join(", ")}`, body);
  };

  const sendOnboardingResponseWithBody = async (displayContent: string, body: Record<string, any>) => {
    if (!user || isSending) return;
    setInputValue("");
    setIsSending(true);
    try {
      await supabase.from("chat_messages").insert({
        user_id: user.id, role: "user", content: displayContent, message_type: "text",
      });
      const { data, error: onboardingError } = await supabase.functions.invoke("chat-onboarding", { body });
      if (onboardingError) console.error("Onboarding error:", onboardingError);
      else {
        await refreshMessages(user.id);
        if (data?.onboardingComplete) setIsOnboarding(false);
      }
      inputRef.current?.focus();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Failed to send message", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
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
    return inputType === "symptom_picker" || inputType === "anchor_picker" || inputType === "date_picker" || inputType === "topic_picker" || inputType === "life_stage_picker";
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

  // During onboarding, force the Ask tab
  const effectiveTab = isOnboarding ? "ask" : activeTab;

  // When switching tabs, position the scroll appropriately
  useEffect(() => {
    if (effectiveTab === "ask") {
      // On Ask, jump to the start of the most recent message
      requestAnimationFrame(() => {
        lastMessageRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
      });
    } else {
      // On Home / Plan / any other tab, start at the top of the view
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    }
  }, [effectiveTab]);

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
    <div className="h-[100svh] supports-[height:100dvh]:h-[100dvh] bg-background flex flex-col relative">
      {/* Header */}
      <header className="shrink-0 border-b border-border/50 bg-card z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
           <div className="flex items-center gap-3">
             {cycleData ? (
                 <ChatCycleCircle
                   cycleDay={cycleData.cycleDay}
                   phase={cycleData.phase}
                   cycleLengthDays={cycleData.cycleLengthDays}
                   size="sm"
                   lifeStage={cycleData.lifeStage}
                   postpartumStartDate={cycleData.postpartumStartDate}
                   postpartumActive={cycleData.postpartumActive}
                   lossDate={cycleData.lossDate}
                   dueDate={cycleData.dueDate}
                   pregnancyLmp={cycleData.pregnancyLmp}
                 />
             ) : (
               <LoganLogo size="sm" />
             )}
              <div>
                <h1 className="font-display font-semibold text-foreground">Logan</h1>
              </div>
           </div>
          <div className="flex items-center gap-3">
            {/* Credit balance hidden — free access during alpha */}

            {effectiveTab === "ask" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchOpen((v) => !v)}
                aria-label="Search chat"
                title="Search chat"
              >
                <Search className="w-4 h-4" />
              </Button>
            )}


            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFeedbackOpen(true)}
              aria-label="Send feedback"
              title="Send feedback"
            >
              <MessageCircle className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Feedback</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Tab content */}
      {effectiveTab === "home" && (
        <HomeTab
          cycleData={cycleData}
          userId={user?.id}
          onPeriodUpdate={async (date: Date) => {
            if (!user?.id) return;
            const iso = format(date, "yyyy-MM-dd");
            await supabase.from("participants").update({
              last_period_start: iso,
              period_pending_since: null,
              period_still_active: false,
              current_period_end_date: null,
            }).eq("user_id", user.id);
          }}
          onCycleLengthUpdate={async (days: number) => {
            if (!user?.id) return;
            await supabase.from("participants").update({
              cycle_length_days: days,
              cycle_length_user_override: true,
            }).eq("user_id", user.id);
          }}
          onPhaseOverride={async (phase) => {
            if (!user?.id || !cycleData?.lastPeriodStart || !cycleData.cycleLengthDays) return;
            if (phase === "auto") {
              const { data: hist } = await (supabase as any)
                .from("cycle_history")
                .select("cycle_length_days")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(6);
              const recomputed = autoCycleLengthFromHistory(hist ?? []);
              await supabase.from("participants").update({
                cycle_length_days: recomputed,
                cycle_length_user_override: false,
              }).eq("user_id", user.id);
              return;
            }
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const live = calculateCycleInfo(cycleData.lastPeriodStart, cycleData.cycleLengthDays, tz);
            const inferred = inferCycleLengthForDeclaredPhase(live?.cycleDay ?? 1, phase, cycleData.cycleLengthDays);
            await supabase.from("participants").update({
              cycle_length_days: inferred,
              cycle_length_user_override: true,
              period_pending_since: null,
              period_still_active: false,
            }).eq("user_id", user.id);
          }}
          onPostpartumDeclare={async () => {
            if (!user?.id) return;
            await supabase.from("participants").update({
              life_stage: "postpartum",
              postpartum_active: true,
              postpartum_start_date: new Date().toISOString().slice(0, 10),
            }).eq("user_id", user.id);
          }}
          onStillCyclingDeclare={async () => {
            if (!user?.id) return;
            await supabase.from("participants").update({
              life_stage: "cycling",
              postpartum_active: false,
            }).eq("user_id", user.id);
          }}
        />
      )}

      {effectiveTab === "plan" && user && (
        <PlanTab
          userId={user.id}
          cycleData={cycleData}
          onPeriodUpdate={async (date: Date) => {
            if (!user?.id) return;
            const iso = format(date, "yyyy-MM-dd");
            await supabase.from("participants").update({
              last_period_start: iso,
              period_pending_since: null,
              period_still_active: false,
              current_period_end_date: null,
            }).eq("user_id", user.id);
          }}
        />
      )}

      {effectiveTab === "ask" && (<>
      {/* Chat search bar */}
      {searchOpen && (() => {
        const q = debouncedQuery.toLowerCase();
        const searchable = messages.filter(
          (m) => m.message_type !== "reaction" && m.message_type !== "checkin"
        );
        const matches = q
          ? searchable.filter((m) => (m.content || "").toLowerCase().includes(q))
          : [];
        const total = matches.length;
        const idx = total > 0 ? ((currentMatchIdx % total) + total) % total : 0;
        const gotoMatch = (delta: number) => {
          if (total === 0) return;
          const next = ((idx + delta) % total + total) % total;
          setCurrentMatchIdx(next);
          const target = matches[next];
          if (target) {
            messageRefs.current[target.id]?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }
        };
        const closeSearch = () => {
          setSearchOpen(false);
          setSearchQuery("");
          setDebouncedQuery("");
          setCurrentMatchIdx(0);
        };
        return (
          <div className="z-20 bg-card border-b border-border/50 px-4 py-2">
            <div className="max-w-3xl mx-auto w-full flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-full bg-background/60 border border-border/40 px-3 py-1.5">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentMatchIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      gotoMatch(e.shiftKey ? -1 : 1);
                    } else if (e.key === "Escape") {
                      closeSearch();
                    }
                  }}
                  placeholder="Search your chat..."
                  className="border-0 bg-transparent px-0 h-8 font-sans focus-visible:ring-0 focus-visible:ring-offset-0"
                  style={{ fontFamily: "Quicksand, sans-serif" }}
                />
                {debouncedQuery && (
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {total > 0 ? `${idx + 1}/${total}` : "0"}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={() => gotoMatch(-1)}
                  disabled={total === 0}
                  aria-label="Previous match"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={() => gotoMatch(1)}
                  disabled={total === 0}
                  aria-label="Next match"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={closeSearch}
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            {debouncedQuery && total === 0 && (
              <div className="max-w-3xl mx-auto w-full mt-2 text-xs text-muted-foreground">
                No results for "{debouncedQuery}"
              </div>
            )}
          </div>
        );
      })()}

      {/* Onboarding Progress Bar */}
      {isOnboarding && (
        <div className="z-20 flex items-center gap-2 bg-card border-b border-border/50 px-4 py-2">
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
        className="flex-1 min-h-0 px-4"
        onScrollCapture={(e) => {
          const el = e.currentTarget.querySelector('[data-radix-scroll-area-viewport]');
          if (el) {
            const { scrollTop, scrollHeight, clientHeight } = el;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            isNearBottomRef.current = distanceFromBottom < SCROLL_NEAR_BOTTOM_PX;
            setShowScrollButton(distanceFromBottom > SCROLL_BUTTON_SHOW_PX);
          }
        }}
      >
        <div className="max-w-3xl mx-auto py-6 space-y-4">
          {/* Load older messages button */}
          {hasOlderMessages && (
            <div className="flex justify-center py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadOlderMessages}
                disabled={isLoadingOlder}
                className="text-xs text-muted-foreground hover:text-foreground gap-2"
              >
                {isLoadingOlder ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ChevronLeft className="w-3 h-3 rotate-90" />
                )}
                {isLoadingOlder ? "Loading..." : "Load older messages"}
              </Button>
            </div>
          )}

          {messages.length === 0 && !isLoading ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <p className="text-muted-foreground">Starting your conversation...</p>
            </div>
          ) : (
            messages
              .filter(msg => msg.message_type !== "reaction" && msg.message_type !== "checkin")
              .map((message, index, filteredMessages) => {
              const isLastMessage = index === filteredMessages.length - 1;
              
              // Date separator logic
              const messageDate = new Date(message.created_at);
              const prevMessage = index > 0 ? filteredMessages[index - 1] : null;
              const prevDate = prevMessage ? new Date(prevMessage.created_at) : null;
              const showDateSeparator = !prevDate || 
                messageDate.toDateString() !== prevDate.toDateString();
              
              const today = new Date();
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);
              
              let dateLabel = "";
              if (showDateSeparator) {
                if (messageDate.toDateString() === today.toDateString()) {
                  dateLabel = "Today";
                } else if (messageDate.toDateString() === yesterday.toDateString()) {
                  dateLabel = "Yesterday";
                } else {
                  dateLabel = format(messageDate, "MMMM d, yyyy");
                }
              }
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
                <div
                  key={message.id}
                  ref={(el) => {
                    messageRefs.current[message.id] = el;
                    if (isLastMessage) {
                      (lastMessageRef as any).current = el;
                    }
                  }}
                >
                  {showDateSeparator && (
                    <div className="flex items-center justify-center my-4">
                      <span className="text-xs text-muted-foreground bg-background/80 px-3 py-1 rounded-full border border-border/40">
                        {dateLabel}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const q = debouncedQuery.toLowerCase();
                    const isMatch =
                      !!q && (message.content || "").toLowerCase().includes(q);
                    const searching = searchOpen && !!q;
                    return (
                  <div
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} ${
                      searching && !isMatch ? "opacity-40" : ""
                    } transition-opacity`}
                  >
                    <div
                      className={`relative max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border"
                      } ${searching && isMatch ? "ring-2 ring-primary" : ""}`}
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
                              lifeStage="cycling"
                              postpartumStartDate={postpartumStartDate || undefined}
                              postpartumActive={postpartumActive && !!postpartumStartDate}
                            />
                          ) : null}
                        </div>
                      )}

                      {/* Message text (intro for proactive insights) */}
                      {message.role === "assistant" ? (
                        <MarkdownMessage content={message.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">
                          <HighlightedText
                            text={message.content}
                            query={searchOpen ? debouncedQuery : ""}
                          />
                        </p>
                      )}

                      {/* Education cards */}
                      {message.metadata?.visual_type === "education_cycle_basics" && (
                        <div className="mt-3"><CycleBasicsCard /></div>
                      )}
                      {message.metadata?.visual_type === "education_hormones" && (
                        <div className="mt-3"><HormoneBasicsCard lifeStage={lifeStage} /></div>
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
                            personalizedData={message.metadata.cheat_sheet as any || null}
                            onDimensionResponse={(dim, response) => handleCheatSheetResponse(message.id, dim, response)}
                            savedResponses={(message.metadata?.cheat_sheet_responses as Record<string, string>) || undefined}
                          />
                        </div>
                      )}

                      {/* Engagement question after the cheat sheet */}
                      {message.metadata?.engagement_question && (
                        <div className="mt-3">
                          <MarkdownMessage content={message.metadata.engagement_question as string} />
                        </div>
                      )}

                      {/* Broadcast CTA — deep-link button under admin broadcasts */}
                      {message.metadata?.broadcast && message.metadata?.broadcast_cta && (() => {
                        const cta = message.metadata.broadcast_cta as {
                          label: string;
                          tab: "home" | "ask" | "plan";
                          plan_section?: "mood" | "exercise" | "nutrition" | null;
                        };
                        return (
                          <div className="mt-3">
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1.5"
                              onClick={() => {
                                setActiveTab(cta.tab);
                                trackTabSwitch(cta.tab);
                                if (cta.tab === "plan" && cta.plan_section) {
                                  setTimeout(() => {
                                    window.dispatchEvent(
                                      new CustomEvent("logan:open-plan-section", {
                                        detail: { section: cta.plan_section },
                                      }),
                                    );
                                  }, 50);
                                }
                              }}
                            >
                              {cta.label}
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        );
                      })()}

                      {/* Resource offer card (Logan suggesting a downloadable) */}
                      {message.message_type === "resource_offer" && message.metadata?.resource_type && user && (
                        <ResourceOfferCard
                          userId={user.id}
                          resourceType={message.metadata.resource_type as string}
                          cycleContext={{
                            cycleDay: message.metadata.cycle_day ?? cycleData?.cycleDay ?? null,
                            phase: message.metadata.cycle_phase ?? cycleData?.phase ?? null,
                            cycleLengthDays: message.metadata.cycle_length_days ?? cycleData?.cycleLengthDays ?? null,
                            lastPeriodStart: cycleData?.lastPeriodStart ?? null,
                            timezone: message.metadata.timezone ?? null,
                          }}
                        />
                      )}

                      {/* Generated/generating resource card */}
                      {message.metadata?.resource_id && user && (
                        <ResourceCard
                          resourceId={message.metadata.resource_id as string}
                          userId={user.id}
                        />
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
                  );
                  })()}


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

                  {/* age uses the standard text input below */}

                  {showInteractiveInput && inputType === "life_stage_picker" && (
                    <div className="mt-3 flex flex-col gap-2 max-w-xs">
                      {[
                        { value: "cycling", label: "I have a regular cycle", desc: "Currently menstruating" },
                        { value: "irregular", label: "Irregular or on hormonal BC", desc: "PCOS, unpredictable cycles, or pill/IUD/implant" },
                        { value: "pregnant", label: "Pregnant 🌱", desc: "Currently pregnant" },
                        { value: "postpartum", label: "Postpartum", desc: "Recently had a baby" },
                        { value: "perimenopause", label: "Perimenopause", desc: "Still getting periods, but the pattern is shifting" },
                        { value: "menopause", label: "Menopause", desc: "12+ months without a period" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            sendOnboardingResponse(option.value);
                            setLifeStage(option.value as "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant");
                          }}
                          disabled={isSending}
                          className="text-left px-4 py-3 rounded-xl border border-border/40 bg-card/60 hover:bg-card/90 transition-all active:scale-[0.98]"
                        >
                          <span className="text-sm font-medium text-foreground">{option.label}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">{option.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {showInteractiveInput && inputType === "topic_picker" && (
                    <div className="mt-3">
                      <TopicPicker
                        onSubmit={handleTopicSubmit}
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

                  {/* Conversation starters — persist until used; only swap the selected one */}
                  {isLastMessage && 
                   message.role === "assistant" && 
                   !isOnboarding && (() => {
                    const cyclingPool = [
                      "I just need to vent", "Why do I feel off today?", "What's my energy like today?",
                      "What can I expect tomorrow?", "How should I plan my week?", "Tell me what's normal right now",
                      "What phase am I in right now?", "Any workout tips for today?", "How's my mood likely to shift?",
                      "I'm having a hard day", "What should I eat this week?", "How can I sleep better tonight?",
                      "What's coming up in my cycle?", "How do I make the most of today?", "Why do I feel this way?",
                    ];
                    const menopausePool = [
                      "I just need to vent", "Why is my mood shifting?", "Tell me what's normal right now",
                      "How can I sleep better tonight?", "What helps hot flashes?", "Why am I so tired?",
                      "What should I focus on today?", "How do I protect bone health?", "I'm having a hard day",
                      "Any strength training tips?", "How can I reduce brain fog?", "What should I eat this week?",
                      "Why do I feel this way?", "How do I manage stress better?", "What patterns should I track?",
                    ];
                    const perimenopausePool = [
                      "I just need to vent", "Why is my cycle changing?", "Is this a hot flash?",
                      "Why am I waking up at 3am?", "What's my phase doing this month?", "How do I track perimenopause patterns?",
                      "Why do my moods feel sharper?", "Any strength training tips?", "What should I eat this week?",
                      "How do I protect bone health now?", "Why am I so tired lately?", "I'm having a hard day",
                      "Should I consider HRT?", "How do I sleep better tonight?", "What patterns should I track?",
                    ];
                    const postpartumPool = [
                      "I just need to vent", "Why am I so exhausted?", "Tell me what's normal right now",
                      "How can I sleep better tonight?", "Why does my mood swing so much?", "What should I eat this week?",
                      "When will my period come back?", "How do I rebuild strength safely?", "I'm having a hard day",
                      "Why is my hair falling out?", "How do I handle the mental load?", "What's happening with my hormones?",
                      "Why do I feel like a different person?", "How can I get more energy?", "What patterns should I track?",
                    ];
                    const pool = lifeStage === "menopause"
                      ? menopausePool
                      : lifeStage === "perimenopause"
                        ? perimenopausePool
                        : lifeStage === "postpartum"
                          ? postpartumPool
                          : cyclingPool;

                    // AI-suggested starters (per-message) take precedence and behave as before
                    const aiStarters = message.metadata?.conversation_starters;
                    if (aiStarters && aiStarters.length > 0) {
                      return (
                        <ConversationStarters
                          starters={aiStarters}
                          onSelect={(starter) => {
                            setInputValue(starter);
                            sendAIMessage(starter);
                          }}
                          disabled={isSending}
                        />
                      );
                    }

                    // Initialize persistent starters once
                    if (visibleStarters.length === 0) {
                      const initial = pool.filter(s => !usedStarters.includes(s)).slice(0, 3);
                      if (initial.length > 0) {
                        setTimeout(() => setVisibleStarters(initial), 0);
                      }
                      return null;
                    }

                    return (
                      <ConversationStarters
                        starters={visibleStarters}
                        onSelect={(starter) => {
                          setInputValue(starter);
                          sendAIMessage(starter);
                          const newUsed = [...usedStarters, starter];
                          setUsedStarters(newUsed);
                          const taken = new Set([...newUsed, ...visibleStarters]);
                          const next = pool.find(s => !taken.has(s));
                          setVisibleStarters(prev => {
                            const remaining = prev.filter(s => s !== starter);
                            return next ? [...remaining, next] : remaining;
                          });
                        }}
                        disabled={isSending}
                      />
                    );
                  })()}
                </div>
              );
            })
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className={`fixed right-4 md:right-8 ${shouldShowInteractivePicker() ? "bottom-20" : isOnboarding ? "bottom-28" : "bottom-40"} z-[60]`}>
          <Button
            type="button"
            size="icon"
            onClick={() => {
              const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
              const hasViewportScroll = !!viewport && viewport.scrollHeight > viewport.clientHeight + 1;

              if (hasViewportScroll && viewport) {
                viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
              } else {
                window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
              }

              isNearBottomRef.current = true;
              setShowScrollButton(false);
            }}
            aria-label="Jump to latest message"
            className="h-12 w-12 rounded-full shadow-card animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <ArrowDown className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Out of credits gate — disabled during alpha */}

      {/* Input - hide when showing interactive pickers or out of credits */}
      {!shouldShowInteractivePicker() && (
        <div className={`border-t border-border/50 bg-card shrink-0 ${!isOnboarding ? "pb-14" : ""}`}>
          <div className="max-w-3xl mx-auto px-4 pt-4">
            {showTopicPrompt && !isOnboarding && (
              <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">Choose your Focus Areas</p>
                <p className="text-xs text-muted-foreground">Pick the topics you want Logan to focus on — diet, exercise, sleep, and more.</p>
                <TopicPicker
                  onSubmit={async (topics) => {
                    if (!user) return;
                    try {
                      setIsSending(true);
                      const { error } = await supabase.functions.invoke("chat-onboarding", {
                        body: { action: "set_topics", selectedTopics: topics },
                      });
                      if (error) throw error;
                      setShowTopicPrompt(false);
                      toast({ title: "Focus areas saved!", description: "Your insights will now be tailored to these topics." });
                    } catch (e) {
                      console.error("Error saving topics:", e);
                      toast({ title: "Failed to save", variant: "destructive" });
                    } finally {
                      setIsSending(false);
                    }
                  }}
                  isSubmitting={isSending}
                />
              </div>
            )}
          </div>
          <form onSubmit={sendMessage} className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex gap-2">
              {!isOnboarding && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 shrink-0"
                  onClick={() => setImportOpen(true)}
                  disabled={isSending}
                  aria-label="Import history or blood test"
                  title="Import history or blood test"
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
              )}
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={(e) => {
                  // Ensure input is visible when mobile keyboard opens
                  setTimeout(() => {
                    e.target.scrollIntoView({ block: "center", behavior: "smooth" });
                  }, 300);
                }}
                placeholder={isOnboarding ? "Type your answer..." : "Ask me anything..."}
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
            <p className="text-xs text-muted-foreground/60 text-center mt-2">
              {isOnboarding 
                ? "Answer Logan's questions to personalize your experience"
                : "Logan is not a medical professional. Always consult your doctor for medical advice."
              }
            </p>
          </form>

          {/* PWA install prompt — below input bar, above bottom nav */}
          {!isOnboarding && user && messages.length > 0 && (
            <div className="max-w-3xl mx-auto px-4 pb-4">
              <InstallPWABanner userId={user.id} />
            </div>
          )}
        </div>
      )}
      </>)}

      {/* Bottom tab bar — hide during onboarding */}
      {!isOnboarding && (
        <BottomTabBar
          activeTab={effectiveTab}
          onTabChange={(tab) => { setActiveTab(tab); trackTabSwitch(tab); trackPageView(`/chat/${tab}`); }}
          cycleDay={cycleData?.cycleDay}
          cycleLengthDays={cycleData?.cycleLengthDays}
          phase={cycleData?.phase}
        />
      )}
    </div>

    {/* Forecast overlay removed — forecast now lives in Plan tab */}
    <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    <SettingsDialog
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      userEmail={user?.email || undefined}
      userId={user?.id}
      currentLifeStage={lifeStage}
      onUpdated={(newStage) => {
        setLifeStage(newStage);
        if (newStage !== "postpartum") setPostpartumStartDate(null);
      }}
      onHistoryImported={() => {
        // Reload to surface the new assistant recap message + refreshed analytics
        window.location.reload();
      }}
    />
    <HistoryImportDialog
      open={importOpen}
      onOpenChange={setImportOpen}
      userId={user?.id}
      onImported={() => {
        // Surface new recap message + refreshed analytics
        window.location.reload();
      }}
    />
    </>
  );
};

export default Chat;
