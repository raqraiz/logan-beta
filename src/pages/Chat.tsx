import { trackedSupabase } from "@/lib/messageFailures";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";

import { supabase } from "@/integrations/supabase/client";
import { setPhaseLengthPrefs } from "@/lib/phaseLengths";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { LoganLogo } from "@/components/LoganLogo";
import { LoganFullLogo } from "@/components/LoganFullLogo";

import { Send, Loader2, LogOut, ChevronLeft, ChevronRight, ArrowDown, MessageSquarePlus, MessageCircle, Settings as SettingsIcon, Paperclip, Search, X, ChevronUp, ChevronDown, Megaphone } from "lucide-react";
import { FeedbackModal } from "@/components/chat/FeedbackModal";
import { FeedbackPromptCard } from "@/components/chat/FeedbackPromptCard";
import { useFeedbackPrompt } from "@/hooks/useFeedbackPrompt";
import { SettingsDialog } from "@/components/chat/SettingsDialog";
import { CoachMarkTour } from "@/components/chat/CoachMarkTour";
import { HistoryImportDialog } from "@/components/chat/HistoryImportDialog";
import { VoiceInputButton } from "@/components/chat/VoiceInputButton";
import { format, addWeeks, subYears } from "date-fns";
import { SymptomPicker } from "@/components/chat/SymptomPicker";
import { AnchorPicker } from "@/components/chat/AnchorPicker";
import { DatePickerInput } from "@/components/chat/DatePickerInput";
import { OnboardingProgress } from "@/components/chat/OnboardingProgress";
import { ChatCycleCircle, calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { LoganTodaySection } from "@/components/chat/LoganTodaySection";
import { SymptomLogWidget } from "@/components/home/SymptomLogWidget";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { refreshStageBoundary } from "@/hooks/useStageBoundary";
import { inferCycleLengthForDeclaredPhase, autoCycleLengthFromHistory } from "@/lib/cyclePhase";
import { updateParticipant } from "@/lib/participantWrite";
import { HormoneChart } from "@/components/chat/HormoneChart";
import { SymptomMap } from "@/components/chat/SymptomMap";
import { PhaseCheatSheet } from "@/components/chat/PhaseCheatSheet";

import { TrialChat } from "@/components/chat/TrialChat";
import { MessageFeedback } from "@/components/chat/MessageFeedback";
import { ConversationStarters } from "@/components/chat/ConversationStarters";
import { formatFollowUpQuestion } from "@/lib/formatFollowUpQuestion";
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
import { bcMethodOptionsFor } from "@/lib/bcMethod";
import { usePartnerHeadsupFlag } from "@/hooks/usePartnerHeadsupFlag";
import { PartnerHeadsupDraftCard } from "@/components/partner/PartnerHeadsupDraftCard";
import { PartnerHeadsupCheckinCard, PartnerHeadsupOfferChips, PartnerHeadsupWriteNowChip } from "@/components/partner/PartnerHeadsupMiniCards";
import { OPEN_CHAT_EVENT, PREFILL_CHAT_EVENT } from "@/lib/partnerHeadsupClient";
import { InsightConfirm } from "@/components/chat/InsightConfirm";
import { consumePendingCorrection, takeLinkedCorrectionId } from "@/lib/insightFeedback";
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
    expecting_field?: string;
    question_key?: string;
    branch?: string;
    branch_step?: number;
    branch_total?: number;
    branch_labels?: string[];
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
    event_id?: string;
    hard_day?: boolean;
    preselect?: string[];
    partner_tips?: { help: string[]; skip: string[] };
    person_id?: string;
    partner_name?: string;
    mode?: string;
    kind?: string;
    source_message_id?: string;
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
  onHormonalBc?: boolean | null;
  bcMethod?: string | null;
  postpartumStartDate?: string;
  postpartumActive?: boolean;
  lossDate?: string;
  dueDate?: string;
  pregnancyLmp?: string;
  needsPeriodStart?: boolean;
  cycleAnchorType?: "bleed" | "marker";
}

const MESSAGES_PER_PAGE = 100;

// Display-only labels for onboarding choice echoes (never changes stored values)
const ONBOARDING_ECHO_LABELS: Record<string, string> = {
  // Cycle return
  not_yet: "Cycle status: Not yet",
  regular: "Cycle status: Yes, and it's regular",
  irregular: "Cycle status: Yes, but it's irregular",
  not_sure: "Cycle status: Not sure",
  // Feeding
  breastfeeding: "Feeding: Breastfeeding",
  combination: "Feeding: Combination",
  formula: "Feeding: Formula / not breastfeeding",
  weaned: "Feeding: Weaned",
  // Birth control
  none: "Birth control: None",
  hormonal: "Birth control: Hormonal",
  non_hormonal: "Birth control: Non-hormonal",
  prefer_not_to_say: "Birth control: Prefer not to say",
};

const formatOnboardingEcho = (value: string) => ONBOARDING_ECHO_LABELS[value] ?? value;

// Prefix for date answers, chosen by the field the step is collecting.
const DATE_ECHO_PREFIXES: Record<string, string> = {
  loss_date: "Loss date",
  postpartum_start_date: "Birth date",
  due_date: "Due date",
  last_period_start: "Last period",
};

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  // Birth control "Which kind?" follow-up, shown inline after a yes/hormonal/non-hormonal answer.
  const [bcFollowup, setBcFollowup] = useState<{ base: string; baseLabel: string } | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingRetry, setOnboardingRetry] = useState<(() => void) | null>(null);
  const onboardingRequestIdRef = useRef(0);
  const onboardingRequestInFlightRef = useRef(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingBranch, setOnboardingBranch] = useState<{ step: number; total: number; labels: string[] } | null>(null);
  // Post-onboarding coach-mark tour (spotlights the real nav tabs)
  const [tourOpen, setTourOpen] = useState(false);
  const [tourAnchorSymptom, setTourAnchorSymptom] = useState<string | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [cycleData, setCycleData] = useState<CycleData | null>(null);
  // Live cycle values for message-bubble visuals. Null until participant data
  // resolves — cards then fall back to their stored metadata snapshot, so no flicker.
  const liveCycle = useMemo(() => {
    if (!cycleData) return null;
    if (!cycleData.cycleDay || cycleData.cycleDay <= 0) return null;
    if (!cycleData.phase || cycleData.phase === "Unknown") return null;
    return {
      day: cycleData.cycleDay,
      phase: cycleData.phase,
      len: cycleData.cycleLengthDays || 28,
    };
  }, [cycleData]);
  const [lifeStage, setLifeStage] = useState<"cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant">("cycling");
  const [postpartumStartDate, setPostpartumStartDate] = useState<string | null>(null);
  const [postpartumActive, setPostpartumActive] = useState<boolean>(false);
  const [lossDate, setLossDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [pregnancyLmp, setPregnancyLmp] = useState<string | null>(null);
  const [onHormonalBc, setOnHormonalBc] = useState<boolean | null>(null);
  const [bcMethod, setBcMethod] = useState<string | null>(null);
  // Authoritative cycle data from `participants` table — wins over chat metadata
  const [participantCycle, setParticipantCycle] = useState<{
    lastPeriodStart: string | null;
    cycleLengthDays: number | null;
    timezone: string | null;
    currentPeriodEndDate: string | null;
    periodPendingSince: string | null;
    periodStillActive: boolean;
    cycleAnchorType?: "bleed" | "marker";
  } | null>(null);
  // A message may only render live cycle values if it was created today (in the
  // user's timezone). Older messages keep their stored per-message snapshot.
  const isMessageFromToday = useCallback((createdAt?: string) => {
    if (!createdAt) return false;
    const tz = participantCycle?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
      return fmt.format(new Date(createdAt)) === fmt.format(new Date());
    } catch {
      return new Date(createdAt).toDateString() === new Date().toDateString();
    }
  }, [participantCycle?.timezone]);
  const [showForecast, setShowForecast] = useState(false);
  
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [pillHasNew, setPillHasNew] = useState(false);
  const userScrolledRef = useRef(false);
  const [feelSheetOpen, setFeelSheetOpen] = useState(false);
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
  const { showFeedbackPrompt, dismissFeedbackPrompt } = useFeedbackPrompt(user?.id);
  usePresence(user?.id, user?.email || undefined, user?.user_metadata?.full_name);
  const { trackTabSwitch, trackPageView } = useActivityTracker(user?.id);

  // Track initial page view
  useEffect(() => {
    trackPageView(window.location.pathname);
  }, [trackPageView]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headsupVisible = usePartnerHeadsupFlag(user?.id);
  useEffect(() => {
    const openChat = async (e: Event) => {
      setActiveTab("ask");
      const focusId = (e as CustomEvent).detail?.focusMessageId as string | undefined;
      if (!focusId || !user) return;
      const list = await refreshMessages(user.id);
      if (!list.some((m) => m.id === focusId)) return;
      setTimeout(() => {
        const el = document.getElementById(`headsup-${focusId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        else scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    };
    const prefill = (e: Event) => {
      setActiveTab("ask");
      setInputValue(String((e as CustomEvent).detail ?? ""));
    };
    window.addEventListener(OPEN_CHAT_EVENT, openChat);
    window.addEventListener(PREFILL_CHAT_EVENT, prefill);
    return () => {
      window.removeEventListener(OPEN_CHAT_EVENT, openChat);
      window.removeEventListener(PREFILL_CHAT_EVENT, prefill);
    };
  },[user?.id]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const todaySectionRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer on any value change, including programmatic
  // inserts (e.g. voice dictation) that don't fire onChange.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [inputValue]);
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
      const md = latestOnboardingMsg.metadata;
      setOnboardingBranch(
        (md.branch === "postpartum" || md.branch === "pregnancy_loss") &&
        typeof md.branch_step === "number" && typeof md.branch_total === "number"
          ? { step: md.branch_step, total: md.branch_total, labels: Array.isArray(md.branch_labels) ? md.branch_labels : [] }
          : null
      );
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

            // Reconcile optimistic "fallback-" bubbles. Exact content match is too
            // strict (server may sanitize/trim), which let duplicates slip through as
            // distinct rows — fall back to the newest unreconciled fallback of the
            // same role within a short window.
            const isSameRoleFallback = (m: ChatMessage) =>
              m.id.startsWith("fallback-") && m.role === incomingMessage.role;
            const withinWindow = (m: ChatMessage) => {
              const t = new Date(m.created_at).getTime();
              const incoming = new Date(incomingMessage.created_at).getTime();
              return Number.isFinite(t) && Math.abs(incoming - t) < 60_000;
            };
            let fallbackIdx = prev.findIndex(
              (m) => isSameRoleFallback(m) && m.content === incomingMessage.content
            );
            if (fallbackIdx === -1) {
              for (let i = prev.length - 1; i >= 0; i--) {
                if (isSameRoleFallback(prev[i]) && withinWindow(prev[i])) {
                  fallbackIdx = i;
                  break;
                }
              }
            }
            if (fallbackIdx !== -1) {
              const updated = [...prev];
              updated[fallbackIdx] = incomingMessage;
              return updated;
            }

            // Suppress consecutive identical assistant bubbles (CTA / placeholder
            // double-inserts) that arrive within a short window.
            if (incomingMessage.role === "assistant") {
              const last = [...prev].reverse().find((m) => m.role === "assistant");
              if (
                last &&
                last.id !== incomingMessage.id &&
                last.content === incomingMessage.content &&
                (last.message_type ?? "text") === (incomingMessage.message_type ?? "text") &&
                withinWindow(last)
              ) {
                return prev;
              }
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
            cycleAnchorType: row.cycle_anchor_type === "marker" ? "marker" : "bleed",
          });
          if (row.life_stage) {
            // Birth date is the entry gate for postpartum. Postpartum with no
            // birth date on file is a data inconsistency — treat as cycling.
            const stageRow = row.life_stage === "postpartum" && !row.postpartum_start_date
              ? "cycling"
              : row.life_stage;
            setLifeStage(stageRow as "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant");
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
          if ((row as any).on_hormonal_bc !== undefined) {
            setOnHormonalBc((row as any).on_hormonal_bc ?? null);
          }
          if ((row as any).birth_control_method !== undefined) {
            setBcMethod((row as any).birth_control_method ?? null);
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
        onHormonalBc,
        bcMethod,
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
          onHormonalBc,
          bcMethod,
        });
        return;
      }
      // Cycling user with no period start on file — prompt her to add it on Home
      setCycleData({
        cycleDay: 0,
        phase: "Unknown",
        cycleLengthDays: cycleLengthDays || 28,
        lifeStage: lifeStage === "irregular" ? "irregular" : "cycling",
        onHormonalBc,
        bcMethod,
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
        onHormonalBc,
        bcMethod,
        postpartumStartDate: postpartumStartDate || undefined,
        postpartumActive: postpartumActive && !!postpartumStartDate,
        cycleAnchorType: participantCycle?.cycleAnchorType ?? "bleed",
      });
    }
  }, [user, isOnboarding, messages, lifeStage, postpartumStartDate, postpartumActive, lossDate, dueDate, pregnancyLmp, onHormonalBc, bcMethod, participantCycle]);

  // Scroll to bottom on initial load
  const hasScrolledToBottom = useRef(false);
  useEffect(() => {
    if (isOnboarding) return; // Disable auto-scroll during onboarding, let users read at their own pace
    if (messages.length > 0 && !hasScrolledToBottom.current) {
      hasScrolledToBottom.current = true;
      // Use setTimeout to ensure DOM is rendered
      setTimeout(() => {
        if (todaySectionRef.current) todaySectionRef.current.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
        else scrollRef.current?.scrollIntoView({ behavior: "instant" });
      }, 50);
      // Cards above Today can grow as they render; keep Today pinned for the
      // first moments unless she starts scrolling herself.
      let touched = false;
      const stop = () => { touched = true; };
      window.addEventListener("wheel", stop, { once: true, passive: true });
      window.addEventListener("touchstart", stop, { once: true, passive: true });
      [400, 1000, 2000, 3500].forEach((ms) => setTimeout(() => {
        if (!touched) todaySectionRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
      }, ms));
      setTimeout(() => { window.removeEventListener("wheel", stop); window.removeEventListener("touchstart", stop); }, 4000);
    }
  }, [messages, isOnboarding]);

  // Auto-scroll on new messages
  const lastAutoScrolledIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isOnboarding) return; // Disable auto-scroll during onboarding, let users read at their own pace
    if (messages.length === 0) return;
    if (!hasScrolledToBottom.current) return; // skip until initial scroll done
    const lastMsg = messages[messages.length - 1];
    // Only react to a genuinely new last message, not refetches of the same list
    if (lastAutoScrolledIdRef.current === null) { lastAutoScrolledIdRef.current = lastMsg.id; return; }
    if (lastAutoScrolledIdRef.current === lastMsg.id) return;
    lastAutoScrolledIdRef.current = lastMsg.id;

    if (lastMsg.role === "assistant" && lastMsg.metadata?.insight_type === "proactive" && todaySectionRef.current) return;
    if (lastMsg.role !== "user" && !isNearBottomRef.current) {
      // She is reading further up: don't yank her down, offer the pill instead.
      setPillHasNew(true);
      setShowScrollButton(true);
      return;
    }
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
      const screen = hasViewportScroll ? viewport!.clientHeight : window.innerHeight;
      if (distanceFromBottom <= screen) { setShowScrollButton(false); setPillHasNew(false); }
      else if (userScrolledRef.current) setShowScrollButton(true);
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
        .select("life_stage, on_hormonal_bc, birth_control_method, postpartum_start_date, postpartum_active, loss_date, due_date, pregnancy_lmp, last_period_start, cycle_length_days, timezone, current_period_end_date, period_pending_since, period_still_active, menstruation_days, follicular_days, ovulation_window_days, luteal_days, cycle_anchor_type")
        .eq("email", user.email)
        .single();
      if (data?.life_stage) {
        // Birth date is the entry gate for postpartum (see loader above).
        const stageVal = data.life_stage === "postpartum" && !data.postpartum_start_date
          ? "cycling"
          : data.life_stage;
        setLifeStage(stageVal as "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant");
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
      if ((data as any)?.on_hormonal_bc !== undefined) {
        setOnHormonalBc((data as any).on_hormonal_bc ?? null);
      }
      if ((data as any)?.birth_control_method !== undefined) {
        setBcMethod((data as any).birth_control_method ?? null);
      }
      if (data) {
        setPhaseLengthPrefs({
          menstruation_days: (data as any).menstruation_days ?? null,
          follicular_days: (data as any).follicular_days ?? null,
          ovulation_window_days: (data as any).ovulation_window_days ?? null,
          luteal_days: (data as any).luteal_days ?? null,
        });
      }
      if (data) {

        let effectiveTimezone: string | null = data.timezone ?? null;
        // Silent sync: whenever the phone's timezone differs from the saved one, save the phone's.
        const isValidTz = (tz: string | null) => {
          if (!tz) return false;
          try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
        };
        {
          try {
            const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (detected && isValidTz(detected) && detected !== effectiveTimezone) {
              const { error: tzErr } = await supabase
                .from("participants")
                .update({ timezone: detected })
                .eq("email", user.email!);
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
          cycleAnchorType: (data as any).cycle_anchor_type === "marker" ? "marker" : "bleed",
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
      await trackedSupabase.from("chat_messages").insert({
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
      consumePendingCorrection(user.id, messageContent);
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
      const { data: insertedRow, error: insertError } = await trackedSupabase
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
        body: { userMessage: messageContent, correctionMessageId: takeLinkedCorrectionId() },
      });
      // Boundary just saved: refresh the shared cache so Home, Plan and the ring update now.
      if (data?.boundarySaved) void refreshStageBoundary();

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
    skipMessageInsert = false,
    displayLabel?: string,
  ) => {
    if (!user || isSending || onboardingRequestInFlightRef.current) return;

    const requestId = ++onboardingRequestIdRef.current;
    onboardingRequestInFlightRef.current = true;
    setOnboardingError(null);
    setOnboardingRetry(null);
    setInputValue("");
    setIsSending(true);
    let messageStored = skipMessageInsert;

    try {
      // First, insert the user's message
      const displayContent = symptoms 
        ? `Selected: ${symptoms.length > 0 ? symptoms.join(", ") : "None"}`
        : anchor 
          ? `Anchor symptom: ${anchor}`
          : date
            ? displayLabel ?? `${lifeStage === "postpartum" ? "Birth date" : "Last period"}: ${format(date, "PPP")}`
            : displayLabel ?? formatOnboardingEcho(messageContent);

      if (!skipMessageInsert) {
        const { error } = await trackedSupabase.from("chat_messages").insert({
          user_id: user.id,
          role: "user",
          content: displayContent,
          message_type: "text",
        });

        if (error) throw error;
        messageStored = true;
      }

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

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
      let result;
      try {
        result = await supabase.functions.invoke("chat-onboarding", {
          body,
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (requestId !== onboardingRequestIdRef.current) return;
      const { data, error: invokeError } = result;

      if (invokeError) throw invokeError;

      await refreshMessages(user.id);
      if (requestId !== onboardingRequestIdRef.current) return;
      if (data?.onboardingComplete) {
        setIsOnboarding(false);
        setTourAnchorSymptom((data?.anchorSymptom as string) || null);
        setTimeout(() => setTourOpen(true), 400);
      }
      
      inputRef.current?.focus();
    } catch (error) {
      if (requestId !== onboardingRequestIdRef.current) return;
      console.error("Error sending message:", error);
      setOnboardingError("Something went wrong, try again");
      setOnboardingRetry(() => () => {
        void sendOnboardingResponse(messageContent, symptoms, anchor, date, messageStored);
      });
      setInputValue(messageContent);
    } finally {
      if (requestId === onboardingRequestIdRef.current) {
        onboardingRequestInFlightRef.current = false;
        setIsSending(false);
      }
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

  const handleDateSubmit = (date: Date, expectingField?: string) => {
    const prefix = DATE_ECHO_PREFIXES[expectingField ?? ""]
      ?? (lifeStage === "postpartum" ? "Birth date" : "Last period");
    sendOnboardingResponse(
      format(date, "PPP"),
      undefined,
      undefined,
      date,
      false,
      `${prefix}: ${format(date, "PPP")}`,
    );
  };

  const handleTopicSubmit = (topics: string[]) => {
    const body: Record<string, any> = { action: "respond", userMessage: `Topics: ${topics.join(", ")}`, selectedTopics: topics };
    sendOnboardingResponseWithBody(`Focus areas: ${topics.join(", ")}`, body);
  };

  const sendOnboardingResponseWithBody = async (displayContent: string, body: Record<string, any>, skipMessageInsert = false) => {
    if (!user || isSending || onboardingRequestInFlightRef.current) return;
    const requestId = ++onboardingRequestIdRef.current;
    onboardingRequestInFlightRef.current = true;
    setOnboardingError(null);
    setOnboardingRetry(null);
    setInputValue("");
    setIsSending(true);
    let messageStored = skipMessageInsert;
    try {
      if (!skipMessageInsert) {
        const { error } = await trackedSupabase.from("chat_messages").insert({
          user_id: user.id, role: "user", content: displayContent, message_type: "text",
        });
        if (error) throw error;
        messageStored = true;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
      let result;
      try {
        result = await supabase.functions.invoke("chat-onboarding", { body, signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (requestId !== onboardingRequestIdRef.current) return;
      const { data, error: invokeError } = result;
      if (invokeError) throw invokeError;

      await refreshMessages(user.id);
      if (requestId !== onboardingRequestIdRef.current) return;
      if (data?.onboardingComplete) {
        setIsOnboarding(false);
        setTourAnchorSymptom((data?.anchorSymptom as string) || null);
        setTimeout(() => setTourOpen(true), 400);
      }
      inputRef.current?.focus();
    } catch (error) {
      if (requestId !== onboardingRequestIdRef.current) return;
      console.error("Error sending message:", error);
      setOnboardingError("Something went wrong, try again");
      setOnboardingRetry(() => () => {
        void sendOnboardingResponseWithBody(displayContent, body, messageStored);
      });
    } finally {
      if (requestId === onboardingRequestIdRef.current) {
        onboardingRequestInFlightRef.current = false;
        setIsSending(false);
      }
    }
  };

  const goBackToStep = async (targetStep: number) => {
    if (!user || isSending || onboardingRequestInFlightRef.current) return;
    const requestId = ++onboardingRequestIdRef.current;
    onboardingRequestInFlightRef.current = true;
    setOnboardingError(null);
    setOnboardingRetry(null);
    setIsSending(true);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
      let result;
      try {
        result = await supabase.functions.invoke("chat-onboarding", {
          body: { action: "go_back", targetStep },
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (requestId !== onboardingRequestIdRef.current) return;
      const { error } = result;

      if (error) {
        throw error;
      } else {
        // Refresh messages
        const { data: freshMessages } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (freshMessages) {
          if (requestId !== onboardingRequestIdRef.current) return;
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
      if (requestId !== onboardingRequestIdRef.current) return;
      console.error("Go back error:", error);
      setOnboardingError("Something went wrong, try again");
      setOnboardingRetry(() => () => {
        void goBackToStep(targetStep);
      });
    } finally {
      if (requestId === onboardingRequestIdRef.current) {
        onboardingRequestInFlightRef.current = false;
        setIsSending(false);
      }
    }
  };

  const saveInlineTopics = async (topics: string[]) => {
    if (!user || isSending || onboardingRequestInFlightRef.current) return;
    const requestId = ++onboardingRequestIdRef.current;
    onboardingRequestInFlightRef.current = true;
    setOnboardingError(null);
    setOnboardingRetry(null);
    setIsSending(true);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
      let result;
      try {
        result = await supabase.functions.invoke("chat-onboarding", {
          body: { action: "set_topics", selectedTopics: topics },
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (requestId !== onboardingRequestIdRef.current) return;
      if (result.error) throw result.error;
      setShowTopicPrompt(false);
      toast({ title: "Focus areas saved!", description: "Your insights will now be tailored to these topics." });
    } catch (error) {
      if (requestId !== onboardingRequestIdRef.current) return;
      console.error("Error saving topics:", error);
      setOnboardingError("Something went wrong, try again");
      setOnboardingRetry(() => () => {
        void saveInlineTopics(topics);
      });
    } finally {
      if (requestId === onboardingRequestIdRef.current) {
        onboardingRequestInFlightRef.current = false;
        setIsSending(false);
      }
    }
  };

  // Check if we should show an interactive picker instead of text input
  const shouldShowInteractivePicker = () => {
    if (!isOnboarding || messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant") return false;
    const inputType = lastMessage.metadata?.input_type;
    return inputType === "symptom_picker" || inputType === "anchor_picker" || inputType === "date_picker" || inputType === "topic_picker" || inputType === "life_stage_picker"
      || inputType === "feeding_picker" || inputType === "cycle_return_picker" || inputType === "pp_bc_picker";
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
      const { error } = await trackedSupabase.from("chat_messages").insert({
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

  const showTodaySection = !isOnboarding && !!user;
  const renderTodaySection = () => user ? (
    <LoganTodaySection
      ref={todaySectionRef}
      userId={user.id}
      cycle={cycleData}
      onOpenYou={() => { setActiveTab("home"); trackTabSwitch("home"); }}
      onLogFeeling={() => setFeelSheetOpen(true)}
    />
  ) : null;

  // During onboarding, force the Ask tab
  const effectiveTab = isOnboarding ? "ask" : activeTab;

  // When switching tabs, position the scroll appropriately
  useEffect(() => {
    if (effectiveTab === "ask") {
      // On Logan, land on the Today section (else the start of the latest message)
      requestAnimationFrame(() => {
        if (todaySectionRef.current) { todaySectionRef.current.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" }); return; }
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
              <h1 className="text-foreground"><LoganFullLogo size="sm" /></h1>
           </div>
          <div className="flex items-center gap-2">
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
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Settings"
              className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-sm font-bold text-foreground"
            >
              {(user?.user_metadata?.first_name || user?.user_metadata?.full_name || user?.email || "?").trim().charAt(0).toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      {/* Tab content */}
      {effectiveTab === "home" && (
        <HomeTab
          cycleData={cycleData}
          userId={user?.id}
          onLogFeeling={() => setFeelSheetOpen(true)}
          onPeriodUpdate={async (date: Date) => {
            if (!user?.id) return;
            const iso = format(date, "yyyy-MM-dd");
            // Edit cycle: only the date changes, the anchor type stays as-is.
            await updateParticipant(user.id, {
              last_period_start: iso,
              period_pending_since: null,
              period_still_active: false,
              current_period_end_date: null,
            } as any);
          }}
          onCycleMarkerStart={async (date: Date, note?: string | null) => {
            if (!user?.id) return;
            const iso = format(date, "yyyy-MM-dd");
            // "New cycle started" button → explicit marker (no bleed).
            // Archive previous cycle keeping its own type, same 15-60 day gate.
            try {
              const { data: p } = await (supabase as any)
                .from("participants")
                .select("id, last_period_start, cycle_anchor_type")
                .eq("user_id", user.id)
                .single();
              if (p?.last_period_start && p?.id) {
                const prev = new Date(p.last_period_start + "T12:00:00Z").getTime();
                const next = new Date(iso + "T12:00:00Z").getTime();
                const diff = Math.round((next - prev) / 86400000);
                if (diff >= 15 && diff <= 60) {
                  await (supabase as any).from("cycle_history").insert({
                    participant_id: p.id,
                    cycle_start_date: p.last_period_start,
                    cycle_end_date: iso,
                    cycle_length_days: diff,
                    cycle_anchor_type: p.cycle_anchor_type || "bleed",
                  });
                }
              }
            } catch {}
            await updateParticipant(user.id, {
              last_period_start: iso,
              cycle_anchor_type: "marker",
              period_pending_since: null,
              period_still_active: false,
              current_period_end_date: null,
            } as any);
            // Optional note chip. Never blocks the save.
            if (note) {
              try {
                const { data: pp } = await (supabase as any)
                  .from("participants").select("id").eq("user_id", user.id).single();
                if (pp?.id) {
                  await (supabase as any).from("cycle_updates").insert({
                    participant_id: pp.id,
                    update_type: "cycle_marker",
                    description: note,
                  });
                }
              } catch (e) { console.error("cycle marker note failed", e); }
            }
          }}
          onCycleLengthUpdate={async (days: number) => {
            if (!user?.id) return;
            await updateParticipant(user.id, {
              cycle_length_days: days,
              cycle_length_user_override: true,
            });
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
              await updateParticipant(user.id, {
                cycle_length_days: recomputed,
                cycle_length_user_override: false,
              });
              return;
            }
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const live = calculateCycleInfo(cycleData.lastPeriodStart, cycleData.cycleLengthDays, tz);
            const inferred = inferCycleLengthForDeclaredPhase(live?.cycleDay ?? 1, phase, cycleData.cycleLengthDays);
            await updateParticipant(user.id, {
              cycle_length_days: inferred,
              cycle_length_user_override: true,
              period_pending_since: null,
              period_still_active: false,
            });
          }}
          onPostpartumDeclare={async () => {
            if (!user?.id) return;
            await updateParticipant(user.id, {
              life_stage: "postpartum",
              postpartum_active: true,
              postpartum_start_date: new Date().toISOString().slice(0, 10),
            });
          }}
          onStillCyclingDeclare={async () => {
            if (!user?.id) return;
            await updateParticipant(user.id, {
              life_stage: "cycling",
              postpartum_active: false,
            });
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
            // Edit cycle: date changes only, anchor type preserved.
            await updateParticipant(user.id, {
              last_period_start: iso,
              period_pending_since: null,
              period_still_active: false,
              current_period_end_date: null,
            } as any);
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
              <OnboardingProgress
                currentStep={onboardingStep}
                totalSteps={5}
                branch={onboardingBranch ?? undefined}
              />
            </div>
          </div>
        </div>
      )}

      {onboardingError && (
        <div className="z-20 border-b border-destructive/30 bg-destructive/10 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">{onboardingError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onboardingRetry?.()}
              disabled={isSending || !onboardingRetry}
            >
              {isSending && <Loader2 className="w-4 h-4 animate-spin" />}
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea
        ref={scrollContainerRef}
        className="flex-1 min-h-0 px-4 [&>[data-radix-scroll-area-viewport]>div]:w-full [&>[data-radix-scroll-area-viewport]>div]:table-fixed"
        onScrollCapture={(e) => {
          const el = e.currentTarget.querySelector('[data-radix-scroll-area-viewport]');
          if (el) {
            const { scrollTop, scrollHeight, clientHeight } = el;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            isNearBottomRef.current = distanceFromBottom < SCROLL_NEAR_BOTTOM_PX;
            if (distanceFromBottom <= clientHeight) { setShowScrollButton(false); setPillHasNew(false); }
            else if (userScrolledRef.current) setShowScrollButton(true);
          }
        }}
        onWheelCapture={() => { userScrolledRef.current = true; }}
        onTouchMoveCapture={() => { userScrolledRef.current = true; }}
      >
        <div className="max-w-3xl mx-auto pt-6 pb-24 space-y-4">
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
              // Keep the picker mounted while the answer is in flight (dimmed +
              // non-interactive) so the tall block doesn't vanish before the new
              // messages land — unmounting early caused a visible scroll jump.
              const showInteractiveInput = isLastMessage && message.role === "assistant" && isOnboarding;
              const pickerBusyClass = isSending ? "opacity-60 pointer-events-none transition-opacity" : "";

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

              // Heads-up offer chips render inside the reply they follow (one bubble,
              // one timestamp, one thumbs row, no conversation starters).
              const nextMsg = filteredMessages[index + 1];
              const attachedOffer = message.role === "assistant" && message.message_type !== "partner_headsup_hardday" && nextMsg?.message_type === "partner_headsup_hardday" ? nextMsg : null;
              if (message.message_type === "partner_headsup_hardday" && prevMessage?.role === "assistant") return null;
              const isTodayMsg = isMessageFromToday(message.created_at);
              const startsToday = showTodaySection && isTodayMsg && !(prevMessage && isMessageFromToday(prevMessage.created_at));

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
                  {startsToday && <div className="mb-6">{renderTodaySection()}</div>}
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
                          ? "bg-[var(--user-bubble)] text-[var(--user-bubble-fg)]"
                          : "bg-card text-card-foreground border border-border"
                      } ${searching && isMatch ? "ring-2 ring-primary" : ""}`}
                    >
                      {/* Cycle visual first for insight messages — recomputed live
                          from participant data; stored metadata is the fallback while
                          participant data loads (prevents flicker on initial open). */}
                      {message.metadata?.has_cycle_visual && message.metadata?.cycle_day && message.metadata?.cycle_phase && !(showTodaySection && isTodayMsg && message.metadata.visual_type === "cycle_circle") && (() => {
                        // Only today's messages may show live values; older messages
                        // keep the snapshot captured when they were generated.
                        const live = isMessageFromToday(message.created_at) ? liveCycle : null;
                        const liveDay = live?.day ?? (message.metadata.cycle_day as number);
                        const livePhase = live?.phase ?? (message.metadata.cycle_phase as string);
                        const liveLen = live?.len ?? ((message.metadata.cycle_length_days as number) || 28);
                        return (
                        <div className="mb-3">
                          {message.metadata.visual_type === "hormone_chart" ? (
                            <HormoneChart
                              cycleDay={liveDay}
                              phase={livePhase}
                              cycleLengthDays={liveLen}
                            />
                          ) : message.metadata.visual_type === "symptom_map" ? (
                            <SymptomMap
                              symptoms={message.metadata.validated_symptoms as string[] | undefined}
                              anchorSymptom={message.metadata.anchor_symptom as string | undefined}
                              cycleDay={liveDay}
                              cycleLengthDays={liveLen}
                              phase={livePhase}
                            />
                          ) : message.metadata.visual_type === "cycle_circle" ? (
                            <ChatCycleCircle
                              cycleDay={liveDay}
                              phase={livePhase}
                              cycleLengthDays={liveLen}
                              lifeStage="cycling"
                              postpartumStartDate={postpartumStartDate || undefined}
                              postpartumActive={postpartumActive && !!postpartumStartDate}
                            />
                          ) : null}
                        </div>
                        );
                      })()}

                      {/* Message text (intro for proactive insights) */}
                      {message.message_type === "partner_headsup_draft" && headsupVisible && user ? (
                        <PartnerHeadsupDraftCard
                          userId={user.id}
                          cacheKey={message.id}
                          eventId={typeof message.metadata?.event_id === "string" ? (message.metadata.event_id as string) : undefined}
                          preselect={Array.isArray(message.metadata?.preselect) ? (message.metadata.preselect as string[]) : undefined}
                          partnerTips={message.metadata?.partner_tips as { help: string[]; skip: string[] } | undefined}
                          initialPersonId={typeof message.metadata?.person_id === "string" ? (message.metadata.person_id as string) : undefined}
                        />
                      ) : message.message_type === "partner_headsup_hardday" ? null : message.message_type === "partner_headsup_schedreq" ? null : message.message_type === "partner_headsup_shared" ? (
                        <p className="text-xs text-muted-foreground">{message.content.replace(/^Heads-up shared with (.+?)\.?$/, "Opened WhatsApp for $1.").replace(/^Heads-up shared\.?$/, "Opened WhatsApp.")}</p>
                      ) : message.role === "assistant" ? (
                        <>
                          {typeof (message.metadata as Record<string, unknown> | null)?.system_line === "string" && (
                            <p className="mb-1 text-xs text-muted-foreground">{(message.metadata as Record<string, unknown>).system_line as string}</p>
                          )}
                          <MarkdownMessage content={message.content} />
                        </>
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
                        <div className="mt-3"><AnchorExplainerCard lifeStage={lifeStage} /></div>
                      )}

                      {/* Phase cheat sheet for proactive insights — between intro and question */}
                      {message.role === "assistant" && message.metadata?.insight_type === "proactive" && message.metadata?.cycle_day && message.metadata?.cycle_phase && !(showTodaySection && isTodayMsg) && (() => {
                        const live = isMessageFromToday(message.created_at) ? liveCycle : null;
                        return (
                        <div className="mt-3">
                          <PhaseCheatSheet
                            phase={live?.phase ?? message.metadata.cycle_phase}
                            cycleDay={live?.day ?? message.metadata.cycle_day}
                            cycleLengthDays={live?.len ?? (message.metadata.cycle_length_days || 28)}
                            personalizedData={message.metadata.cheat_sheet as any || null}
                            onDimensionResponse={(dim, response) => handleCheatSheetResponse(message.id, dim, response)}
                            savedResponses={(message.metadata?.cheat_sheet_responses as Record<string, string>) || undefined}
                          />
                        </div>
                        );
                      })()}

                      {/* Engagement question after the cheat sheet */}
                      {message.metadata?.engagement_question && (
                        <div className="mt-3">
                          <MarkdownMessage content={formatFollowUpQuestion(message.metadata.engagement_question as string)} />
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
                      {headsupVisible && message.message_type === "partner_headsup_checkin" && typeof message.metadata?.event_id === "string" && user && (
                        <PartnerHeadsupCheckinCard userId={user.id} eventId={message.metadata.event_id as string} />
                      )}
                      {headsupVisible && message.message_type === "partner_headsup_hardday" && user && (
                        <PartnerHeadsupOfferChips userId={user.id} messageId={message.id}
                          name={(message.metadata as Record<string, unknown> | null)?.partner_headsup === "offer" ? ((message.metadata?.partner_name as string) || null) : null}
                          preselect={Array.isArray(message.metadata?.preselect) ? (message.metadata.preselect as string[]) : []} />
                      )}
                      {headsupVisible && message.message_type === "partner_headsup_schedreq" && user && (
                        <PartnerHeadsupWriteNowChip userId={user.id} messageId={message.id} />
                      )}

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
                      
                      {message.role === "assistant" && ["proactive", "awareness", "symptom_validation"].includes(message.metadata?.insight_type as string) && !showInteractiveInput && (
                        <InsightConfirm userId={user.id} messageId={message.id} insightType={message.metadata.insight_type} />
                      )}
                      {attachedOffer && headsupVisible && user && (
                        <PartnerHeadsupOfferChips userId={user.id} messageId={attachedOffer.id}
                          name={(attachedOffer.metadata as Record<string, unknown> | null)?.partner_headsup === "offer" ? ((attachedOffer.metadata?.partner_name as string) || null) : null}
                          preselect={Array.isArray(attachedOffer.metadata?.preselect) ? (attachedOffer.metadata.preselect as string[]) : []} />
                      )}
                      <div className={`flex items-center gap-2 mt-1 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}>
                        <span className={`text-xs ${
                          message.role === "user" ? "text-[var(--user-bubble-time)]" : "text-muted-foreground"
                        }`}>
                          {format(new Date(message.created_at), "h:mm a")}
                        </span>
                        
                        {/* Thumbs up/down feedback for assistant messages */}
                        {message.role === "assistant" && !showInteractiveInput && message.message_type !== "partner_headsup_shared" && (
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
                    <div className={`mt-3 ${pickerBusyClass}`}>
                      <SymptomPicker
                        categories={message.metadata.symptom_categories}
                        onSubmit={handleSymptomSubmit}
                        isSubmitting={isSending}
                      />
                    </div>
                  )}

                  {showInteractiveInput && inputType === "anchor_picker" && (
                    <div className={`mt-3 ${pickerBusyClass}`}>
                      <AnchorPicker
                        symptoms={message.metadata?.available_symptoms || selectedSymptoms}
                        onSubmit={handleAnchorSubmit}
                        isSubmitting={isSending}
                      />
                    </div>
                  )}

                  {showInteractiveInput && inputType === "date_picker" && (
                    <div className={`mt-3 ${pickerBusyClass}`}>
                      <DatePickerInput
                        onSubmit={(date) => handleDateSubmit(date, message.metadata?.expecting_field)}
                        isSubmitting={isSending}
                        {...(message.metadata?.expecting_field === "due_date"
                          ? { minDate: new Date(), maxDate: addWeeks(new Date(), 42), isDueDate: true }
                          : message.metadata?.expecting_field === "postpartum_start_date"
                          ? { minDate: subYears(new Date(), 5), maxDate: new Date() }
                          : message.metadata?.expecting_field === "loss_date"
                          ? { minDate: subYears(new Date(), 40), maxDate: new Date() }
                          : { minDate: subYears(new Date(), 5), maxDate: new Date() })}
                      />
                      {message.metadata?.expecting_field === "loss_date" && (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSending}
                            onClick={() => sendOnboardingResponse("Skip, I'd rather not say", undefined, undefined, undefined, false, "Skipped")}
                            className="text-muted-foreground"
                          >
                            Skip
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* age uses the standard text input below */}

                  {showInteractiveInput && inputType === "life_stage_picker" && (
                    <div className={`mt-3 flex flex-col gap-2 max-w-xs ${pickerBusyClass}`}>
                      {[
                        { value: "cycling", label: "I have a regular cycle", desc: "Currently menstruating" },
                        { value: "irregular", label: "Irregular or on hormonal BC", desc: "PMOS (formerly PCOS), unpredictable cycles, or pill/IUD/implant" },
                        { value: "pregnant", label: "Pregnant", desc: "Currently pregnant" },
                        { value: "postpartum", label: "Postpartum", desc: "Had a baby. Periods back or not, pick this." },
                        { value: "pregnancy_loss", label: "Pregnancy loss", desc: "Miscarriage or loss, whenever it happened" },
                        { value: "perimenopause", label: "Perimenopause", desc: "Still getting periods, but the pattern is shifting" },
                        { value: "menopause", label: "Menopause", desc: "12+ months without a period" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            sendOnboardingResponse(option.value, undefined, undefined, undefined, false, option.label);
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

                  {showInteractiveInput && bcFollowup && (inputType === "bc_picker" || inputType === "pp_bc_picker") && (
                    <div className={`mt-3 max-w-xs ${pickerBusyClass}`}>
                      <p className="text-sm text-foreground mb-2">Which kind?</p>
                      <div className="flex flex-wrap gap-2">
                        {[...bcMethodOptionsFor(bcFollowup.base === "non_hormonal" ? "non_hormonal" : "hormonal"), { value: "skip", label: "Skip" }].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              const f = bcFollowup;
                              setBcFollowup(null);
                              sendOnboardingResponse(
                                `${f.base}|method:${option.value}`,
                                undefined, undefined, undefined, false,
                                option.value === "skip" ? f.baseLabel : `${f.baseLabel} · ${option.label}`,
                              );
                            }}
                            disabled={isSending}
                            className="text-left px-3 py-2 rounded-xl border border-border/40 bg-card/60 hover:bg-card/90 transition-all active:scale-[0.98] text-sm text-foreground"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showInteractiveInput && !bcFollowup && inputType === "bc_picker" && (
                    <div className={`mt-3 flex flex-col gap-2 max-w-xs ${pickerBusyClass}`}>
                      {[
                        { value: "bc_yes", label: "Yes", desc: "Pill, mini-pill, hormonal IUD, implant, ring, or patch" },
                        { value: "bc_no", label: "No", desc: "Not on hormonal contraception" },
                        { value: "bc_unknown", label: "Prefer not to say", desc: "Logan will keep it general" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => option.value === "bc_yes"
                            ? setBcFollowup({ base: "bc_yes", baseLabel: "Birth control: Yes" })
                            : sendOnboardingResponse(option.value)}
                          disabled={isSending}
                          className="text-left px-4 py-3 rounded-xl border border-border/40 bg-card/60 hover:bg-card/90 transition-all active:scale-[0.98]"
                        >
                          <span className="text-sm font-medium text-foreground">{option.label}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">{option.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {showInteractiveInput && inputType === "uterus_picker" && (
                    <div className={`mt-3 flex flex-col gap-2 max-w-xs ${pickerBusyClass}`}>
                      {[
                        { value: "uterus_removed_yes", label: "Yes", desc: "Uterus removed, ovaries still there, no periods, but your hormones still cycle" },
                        { value: "uterus_removed_no", label: "No", desc: "My uterus is intact" },
                        { value: "uterus_prefer_not", label: "Prefer not to say", desc: "Logan won't assume either way" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => sendOnboardingResponse(option.value)}
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
                    <div className={`mt-3 ${pickerBusyClass}`}>
                      <TopicPicker
                        onSubmit={handleTopicSubmit}
                        isSubmitting={isSending}
                        includePostpartumTopic={message.metadata?.branch === "postpartum"}
                        lifeStage={lifeStage}
                      />
                    </div>
                  )}

                  {/* Postpartum branch: feeding / cycle return / birth control chip pickers */}
                  {showInteractiveInput && !(bcFollowup && inputType === "pp_bc_picker") && (inputType === "feeding_picker" || inputType === "cycle_return_picker" || inputType === "pp_bc_picker") && (
                    <div className={`mt-3 flex flex-col gap-2 max-w-xs ${pickerBusyClass}`}>
                      {(inputType === "feeding_picker"
                        ? [
                            { value: "breastfeeding", label: "Breastfeeding", desc: "Exclusively or mostly" },
                            { value: "combination", label: "Combination", desc: "Breast and formula" },
                            { value: "formula", label: "Formula / not breastfeeding", desc: "" },
                            { value: "weaned", label: "Weaned", desc: "Recently or fully stopped" },
                          ]
                        : inputType === "cycle_return_picker"
                        ? [
                            { value: "not_yet", label: "Not yet", desc: "No period since birth" },
                            { value: "regular", label: "Yes, and it's regular", desc: "" },
                            { value: "irregular", label: "Yes, but it's irregular", desc: "Normal while hormones rebuild" },
                            { value: "not_sure", label: "Not sure", desc: "Some bleeding, hard to tell" },
                          ]
                        : [
                            { value: "none", label: "None", desc: "" },
                            { value: "hormonal", label: "Hormonal", desc: "Mini-pill, hormonal IUD, implant, injection" },
                            { value: "non_hormonal", label: "Non-hormonal", desc: "Copper IUD, condoms, other" },
                            { value: "prefer_not_to_say", label: "Prefer not to say", desc: "Logan will keep it general" },
                          ]
                      ).map((option) => (
                        <button
                          key={option.value}
                          onClick={() => inputType === "pp_bc_picker" && (option.value === "hormonal" || option.value === "non_hormonal")
                            ? setBcFollowup({ base: option.value, baseLabel: `Birth control: ${option.label}` })
                            : sendOnboardingResponse(
                            option.value,
                            undefined,
                            undefined,
                            undefined,
                            false,
                            `${inputType === "feeding_picker" ? "Feeding" : inputType === "cycle_return_picker" ? "Cycle status" : "Birth control"}: ${option.label}`,
                          )}
                          disabled={isSending}
                          className="text-left px-4 py-3 rounded-xl border border-border/40 bg-card/60 hover:bg-card/90 transition-all active:scale-[0.98]"
                        >
                          <span className="text-sm font-medium text-foreground">{option.label}</span>
                          {option.desc && <span className="block text-xs text-muted-foreground mt-0.5">{option.desc}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* "I'm not sure" button for cycle length and last period */}
                  {showInteractiveInput && message.metadata?.show_not_sure && (
                    <div className={`mt-1 ml-1 ${pickerBusyClass}`}>
                      <NotSureButton
                        field={message.metadata.show_not_sure}
                        onUseDefault={() => {
                          if (message.metadata?.show_not_sure === "cycle_length") {
                            sendOnboardingResponse("28");
                          } else if (message.metadata?.show_not_sure === "irregular_last_period") {
                            // Skip without persisting any date — Logan works without it for irregular users
                            sendOnboardingResponse("Not sure, skip");
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
                   !attachedOffer &&
                   message.message_type !== "partner_headsup_hardday" &&
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
          {showTodaySection && messages.length > 0 && !messages.some(m => m.message_type !== "reaction" && m.message_type !== "checkin" && isMessageFromToday(m.created_at)) && renderTodaySection()}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Scroll to bottom button */}
      {/* Out of credits gate — disabled during alpha */}

      {/* Input - hide when showing interactive pickers or out of credits */}
      {!shouldShowInteractivePicker() && (
        <div className={`relative border-t border-border/50 bg-card shrink-0 ${!isOnboarding ? "pb-14" : ""}`}>
          {showScrollButton && !settingsOpen && (
            <button
              type="button"
              onClick={() => {
                const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
                if (viewport && viewport.scrollHeight > viewport.clientHeight + 1) {
                  viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
                } else {
                  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
                }
                isNearBottomRef.current = true;
                setShowScrollButton(false);
                setPillHasNew(false);
              }}
              className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+12px)] z-[60] rounded-full border border-[#DDD7CC] bg-white px-4 py-1.5 font-['Quicksand'] text-[13px] font-semibold text-[#23201C] animate-in fade-in duration-200"
            >
              {pillHasNew ? "New messages ↓" : "Latest ↓"}
            </button>
          )}
          <div className="max-w-3xl mx-auto px-4 pt-4">
            {showTopicPrompt && !isOnboarding && (
              <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">Choose your Focus Areas</p>
                <p className="text-xs text-muted-foreground">Pick the topics you want Logan to focus on, diet, exercise, sleep, and more.</p>
                <TopicPicker
                  onSubmit={saveInlineTopics}
                  isSubmitting={isSending}
                />
              </div>
            )}
          </div>
          {!isOnboarding && showFeedbackPrompt && (
            <FeedbackPromptCard
              onGiveFeedback={() => { dismissFeedbackPrompt(); setFeedbackOpen(true); }}
              onDismiss={dismissFeedbackPrompt}
            />
          )}
          <form onSubmit={sendMessage} className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex gap-2">
              {!isOnboarding && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  onClick={() => setImportOpen(true)}
                  disabled={isSending}
                  aria-label="Import history or blood test"
                  title="Import history or blood test"
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
              )}
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                  }
                }}
                onFocus={(e) => {
                  // Ensure input is visible when mobile keyboard opens
                  setTimeout(() => {
                    e.target.scrollIntoView({ block: "center", behavior: "smooth" });
                  }, 300);
                }}
                rows={1}
                placeholder={isOnboarding ? "Type your answer..." : "Talk to Logan"}
                className="flex-1 min-h-[44px] max-h-[200px] resize-none py-2.5"
                disabled={isSending}
              />
              <VoiceInputButton
                onTranscript={(text) => setInputValue(prev => prev ? `${prev} ${text}` : text)}
                disabled={isSending}
                className="h-11 w-11"
              />
              <Button 
                type="submit" 
                size="icon" 
                className="h-11 w-11 bg-[var(--send-bg)] text-[var(--send-fg)] hover:bg-[var(--send-bg)] hover:opacity-90 disabled:opacity-100 disabled:bg-[var(--send-off-bg)] disabled:text-[var(--send-off-fg)]"
                disabled={!inputValue.trim() || isSending}
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-center font-['Quicksand'] text-[12px] text-[#6E675F] text-balance">
              {isOnboarding
                ? "Answer Logan's questions to personalize your experience"
                : (
                  <>
                    Not medical advice. Check with your doctor.{" · "}
                    <button type="button" onClick={() => setFeedbackOpen(true)} className="underline underline-offset-2">
                      Send feedback
                    </button>
                  </>
                )}
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
    <CoachMarkTour
      open={tourOpen}
      anchorSymptom={tourAnchorSymptom}
      onLogNow={() => {
        setTourOpen(false);
        setActiveTab("home");
        trackTabSwitch("home");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("logan:open-symptom-log", {
            detail: { symptom: tourAnchorSymptom },
          }));
        }, 50);
      }}
      onGoHome={() => {
        setTourOpen(false);
        setActiveTab("home");
        trackTabSwitch("home");
      }}
      onDismiss={() => setTourOpen(false)}
    />
    <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    {user && (
      <Drawer open={feelSheetOpen} onOpenChange={setFeelSheetOpen}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerTitle className="sr-only">How I feel</DrawerTitle>
          <div className="overflow-y-auto px-2 pb-6">
            <SymptomLogWidget
              userId={user.id}
              cycleDay={cycleData?.lifeStage === "cycling" ? cycleData?.cycleDay : undefined}
              phase={cycleData?.phase}
              lastPeriodStart={cycleData?.lastPeriodStart}
              cycleLengthDays={cycleData?.cycleLengthDays}
              isNonCycling={cycleData?.lifeStage !== "cycling"}
              onLogged={(entry) => {
                setFeelSheetOpen(false);
                const parts = entry.symptoms.map(s => s.severity ? `${s.name.toLowerCase()} (${s.severity}/5)` : s.name.toLowerCase());
                const what = parts.length ? parts.join(", ") : "a note";
                const when = entry.isToday ? "today" : "for an earlier day";
                const note = entry.notes ? ` Note: ${entry.notes}` : "";
                setTimeout(() => void sendAIMessage(`I just logged how I feel ${when}: ${what}.${note}`), 300);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    )}
    <SettingsDialog
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      onOpenFeedback={() => setFeedbackOpen(true)}
      onSignOut={handleSignOut}
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
