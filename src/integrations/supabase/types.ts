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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      insight_status: "pending" | "approved" | "rejected" | "sent"
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
    },
  },
} as const
