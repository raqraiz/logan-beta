export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_broadcasts: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          recipient_count: number | null
          segment_filters: Json
          sent_at: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          recipient_count?: number | null
          segment_filters?: Json
          sent_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          recipient_count?: number | null
          segment_filters?: Json
          sent_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      calendar_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          emoji_reaction: string | null
          id: string
          message_type: string | null
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          emoji_reaction?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          emoji_reaction?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      community_messages: {
        Row: {
          channel: string
          content: string
          created_at: string
          display_name: string
          id: string
          is_anonymous: boolean
          is_pinned: boolean
          user_id: string
        }
        Insert: {
          channel?: string
          content: string
          created_at?: string
          display_name: string
          id?: string
          is_anonymous?: boolean
          is_pinned?: boolean
          user_id: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          display_name?: string
          id?: string
          is_anonymous?: boolean
          is_pinned?: boolean
          user_id?: string
        }
        Relationships: []
      }
      community_symptoms: {
        Row: {
          added_by: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_trackers: {
        Row: {
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cycle_history: {
        Row: {
          created_at: string
          cycle_end_date: string
          cycle_length_days: number
          cycle_start_date: string
          id: string
          participant_id: string
        }
        Insert: {
          created_at?: string
          cycle_end_date: string
          cycle_length_days: number
          cycle_start_date: string
          id?: string
          participant_id: string
        }
        Update: {
          created_at?: string
          cycle_end_date?: string
          cycle_length_days?: number
          cycle_start_date?: string
          id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_history_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_updates: {
        Row: {
          category: string | null
          created_at: string
          description: string
          id: string
          participant_id: string
          update_type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description: string
          id?: string
          participant_id: string
          update_type: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          participant_id?: string
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_updates_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      feature_events: {
        Row: {
          created_at: string
          feature_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_name: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          action_taken: boolean | null
          admin_reply: string | null
          admin_reply_at: string | null
          admin_reply_sent: boolean | null
          created_at: string
          emoji_reaction: string | null
          emotion: string | null
          free_form_text: string | null
          id: string
          improvement_suggestion: string | null
          insight_id: string
          is_useful: boolean | null
          participant_id: string
        }
        Insert: {
          action_taken?: boolean | null
          admin_reply?: string | null
          admin_reply_at?: string | null
          admin_reply_sent?: boolean | null
          created_at?: string
          emoji_reaction?: string | null
          emotion?: string | null
          free_form_text?: string | null
          id?: string
          improvement_suggestion?: string | null
          insight_id: string
          is_useful?: boolean | null
          participant_id: string
        }
        Update: {
          action_taken?: boolean | null
          admin_reply?: string | null
          admin_reply_at?: string | null
          admin_reply_sent?: boolean | null
          created_at?: string
          emoji_reaction?: string | null
          emotion?: string | null
          free_form_text?: string | null
          id?: string
          improvement_suggestion?: string | null
          insight_id?: string
          is_useful?: boolean | null
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      home_widget_preferences: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          widget_order: Json
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          widget_order?: Json
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          widget_order?: Json
        }
        Relationships: []
      }
      insights: {
        Row: {
          admin_notes: string | null
          ai_prompt_used: string | null
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string
          id: string
          insight_type: string | null
          participant_id: string
          scheduled_for: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["insight_status"] | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          ai_prompt_used?: string | null
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string
          id?: string
          insight_type?: string | null
          participant_id: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["insight_status"] | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          ai_prompt_used?: string | null
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string
          id?: string
          insight_type?: string | null
          participant_id?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["insight_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          frequency: string
          id: string
          is_enabled: boolean
          last_notification_at: string | null
          preferred_days: string[] | null
          preferred_time: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency?: string
          id?: string
          is_enabled?: boolean
          last_notification_at?: string | null
          preferred_days?: string[] | null
          preferred_time?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          is_enabled?: boolean
          last_notification_at?: string | null
          preferred_days?: string[] | null
          preferred_time?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      participants: {
        Row: {
          additional_notes: string | null
          age: number | null
          anchor_symptom: string | null
          consent_given: boolean | null
          consent_given_at: string | null
          created_at: string
          cycle_length_days: number | null
          cycle_regularity: string | null
          email: string | null
          full_name: string
          goals: string[] | null
          id: string
          is_active: boolean | null
          last_period_start: string | null
          life_stage: string
          postpartum_start_date: string | null
          preferred_channel: string | null
          telegram_chat_id: string | null
          timezone: string | null
          typical_symptoms: string[] | null
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          additional_notes?: string | null
          age?: number | null
          anchor_symptom?: string | null
          consent_given?: boolean | null
          consent_given_at?: string | null
          created_at?: string
          cycle_length_days?: number | null
          cycle_regularity?: string | null
          email?: string | null
          full_name: string
          goals?: string[] | null
          id?: string
          is_active?: boolean | null
          last_period_start?: string | null
          life_stage?: string
          postpartum_start_date?: string | null
          preferred_channel?: string | null
          telegram_chat_id?: string | null
          timezone?: string | null
          typical_symptoms?: string[] | null
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          additional_notes?: string | null
          age?: number | null
          anchor_symptom?: string | null
          consent_given?: boolean | null
          consent_given_at?: string | null
          created_at?: string
          cycle_length_days?: number | null
          cycle_regularity?: string | null
          email?: string | null
          full_name?: string
          goals?: string[] | null
          id?: string
          is_active?: boolean | null
          last_period_start?: string | null
          life_stage?: string
          postpartum_start_date?: string | null
          preferred_channel?: string | null
          telegram_chat_id?: string | null
          timezone?: string | null
          typical_symptoms?: string[] | null
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          credits_per_use: number
          id: string
          is_active: boolean
          max_uses: number
          uses_remaining: number
        }
        Insert: {
          code: string
          created_at?: string
          credits_per_use?: number
          id?: string
          is_active?: boolean
          max_uses?: number
          uses_remaining?: number
        }
        Update: {
          code?: string
          created_at?: string
          credits_per_use?: number
          id?: string
          is_active?: boolean
          max_uses?: number
          uses_remaining?: number
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          created_at: string
          id: string
          promo_code_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          promo_code_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          promo_code_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_feedback: {
        Row: {
          comment: string | null
          created_at: string
          excluded_ingredients: string[] | null
          id: string
          reaction: string
          resource_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          excluded_ingredients?: string[] | null
          id?: string
          reaction: string
          resource_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          excluded_ingredients?: string[] | null
          id?: string
          reaction?: string
          resource_id?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      symptom_logs: {
        Row: {
          created_at: string
          cycle_day: number | null
          cycle_phase: string | null
          id: string
          logged_at: string
          notes: string | null
          symptoms: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_day?: number | null
          cycle_phase?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          symptoms?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_day?: number | null
          cycle_phase?: string | null
          id?: string
          logged_at?: string
          notes?: string | null
          symptoms?: Json
          user_id?: string
        }
        Relationships: []
      }
      tracker_logs: {
        Row: {
          created_at: string
          cycle_day: number | null
          cycle_phase: string | null
          id: string
          intensity: number
          logged_at: string
          notes: string | null
          tracker_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_day?: number | null
          cycle_phase?: string | null
          id?: string
          intensity: number
          logged_at?: string
          notes?: string | null
          tracker_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_day?: number | null
          cycle_phase?: string | null
          id?: string
          intensity?: number
          logged_at?: string
          notes?: string | null
          tracker_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracker_logs_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "custom_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_events: {
        Row: {
          created_at: string
          element_label: string | null
          element_type: string | null
          event_type: string
          id: string
          metadata: Json | null
          page_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          element_label?: string | null
          element_type?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          element_label?: string | null
          element_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          bonus_credits_awarded: boolean
          created_at: string
          free_credits: number
          free_credits_reset_at: string
          id: string
          paid_credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_credits_awarded?: boolean
          created_at?: string
          free_credits?: number
          free_credits_reset_at?: string
          id?: string
          paid_credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_credits_awarded?: boolean
          created_at?: string
          free_credits?: number
          free_credits_reset_at?: string
          id?: string
          paid_credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_dietary_prefs: {
        Row: {
          allergies: string[] | null
          created_at: string
          cuisines: string[] | null
          diet_type: string | null
          dislikes: string[] | null
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string[] | null
          created_at?: string
          cuisines?: string[] | null
          diet_type?: string | null
          dislikes?: string[] | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allergies?: string[] | null
          created_at?: string
          cuisines?: string[] | null
          diet_type?: string | null
          dislikes?: string[] | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      user_resources: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metadata: Json
          pdf_path: string | null
          status: Database["public"]["Enums"]["resource_status"]
          style: string
          title: string
          type: Database["public"]["Enums"]["resource_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["resource_status"]
          style?: string
          title: string
          type: Database["public"]["Enums"]["resource_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["resource_status"]
          style?: string
          title?: string
          type?: Database["public"]["Enums"]["resource_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      community_messages_public: {
        Row: {
          channel: string | null
          content: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          is_anonymous: boolean | null
          is_pinned: boolean | null
          user_id: string | null
        }
        Insert: {
          channel?: string | null
          content?: string | null
          created_at?: string | null
          display_name?: never
          id?: string | null
          is_anonymous?: boolean | null
          is_pinned?: boolean | null
          user_id?: never
        }
        Update: {
          channel?: string | null
          content?: string | null
          created_at?: string | null
          display_name?: never
          id?: string | null
          is_anonymous?: boolean | null
          is_pinned?: boolean | null
          user_id?: never
        }
        Relationships: []
      }
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_auth_email: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      redeem_promo_code_atomic: {
        Args: { _promo_id: string }
        Returns: {
          code: string
          created_at: string
          credits_per_use: number
          id: string
          is_active: boolean
          max_uses: number
          uses_remaining: number
        }
        SetofOptions: {
          from: "*"
          to: "promo_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user"
      insight_status: "pending" | "approved" | "rejected" | "sent"
      resource_status: "generating" | "ready" | "failed"
      resource_type: "meal_plan" | "training_program" | "meditation" | "planner"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      insight_status: ["pending", "approved", "rejected", "sent"],
      resource_status: ["generating", "ready", "failed"],
      resource_type: ["meal_plan", "training_program", "meditation", "planner"],
    },
  },
} as const
