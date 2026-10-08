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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          audience: string | null
          created_at: string
          id: string
          recipient_count: number | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          audience?: string | null
          created_at?: string
          id?: string
          recipient_count?: number | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          audience?: string | null
          created_at?: string
          id?: string
          recipient_count?: number | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audience: Json | null
          body: string
          created_at: string
          created_by: string
          feedback_id: string | null
          id: string
          kind: string
          recipient_count: number | null
          sent_at: string | null
          status: string
          target_filters: Json | null
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audience?: Json | null
          body: string
          created_at?: string
          created_by: string
          feedback_id?: string | null
          id?: string
          kind: string
          recipient_count?: number | null
          sent_at?: string | null
          status?: string
          target_filters?: Json | null
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audience?: Json | null
          body?: string
          created_at?: string
          created_by?: string
          feedback_id?: string | null
          id?: string
          kind?: string
          recipient_count?: number | null
          sent_at?: string | null
          status?: string
          target_filters?: Json | null
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          goal_count: number
          goal_date: string
          id: boolean
          link_clicks_since: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          goal_count: number
          goal_date: string
          id?: boolean
          link_clicks_since?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          goal_count?: number
          goal_date?: string
          id?: boolean
          link_clicks_since?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      attribution_events: {
        Row: {
          anon_id: string
          captured_at: string
          created_at: string
          id: string
          landing_path: string | null
          ref_code: string | null
          referrer: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          anon_id: string
          captured_at?: string
          created_at?: string
          id?: string
          landing_path?: string | null
          ref_code?: string | null
          referrer?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          anon_id?: string
          captured_at?: string
          created_at?: string
          id?: string
          landing_path?: string | null
          ref_code?: string | null
          referrer?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
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
      community_symptoms: {
        Row: {
          added_by: string
          aliases: string[] | null
          canonical_id: string | null
          category: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          status: string
          submitted_by: string | null
        }
        Insert: {
          added_by: string
          aliases?: string[] | null
          canonical_id?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          status?: string
          submitted_by?: string | null
        }
        Update: {
          added_by?: string
          aliases?: string[] | null
          canonical_id?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          status?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_symptoms_canonical_id_fkey"
            columns: ["canonical_id"]
            isOneToOne: false
            referencedRelation: "community_symptoms"
            referencedColumns: ["id"]
          },
        ]
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
          is_builtin: boolean
          is_fam: boolean
          name: string
          options: Json | null
          source: string
          tracker_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          is_fam?: boolean
          name: string
          options?: Json | null
          source?: string
          tracker_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          is_fam?: boolean
          name?: string
          options?: Json | null
          source?: string
          tracker_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cycle_history: {
        Row: {
          created_at: string
          cycle_anchor_type: string
          cycle_end_date: string
          cycle_length_days: number
          cycle_start_date: string
          follicular_days: number | null
          id: string
          luteal_days: number | null
          menstruation_days: number | null
          ovulation_days: number | null
          participant_id: string
        }
        Insert: {
          created_at?: string
          cycle_anchor_type?: string
          cycle_end_date: string
          cycle_length_days: number
          cycle_start_date: string
          follicular_days?: number | null
          id?: string
          luteal_days?: number | null
          menstruation_days?: number | null
          ovulation_days?: number | null
          participant_id: string
        }
        Update: {
          created_at?: string
          cycle_anchor_type?: string
          cycle_end_date?: string
          cycle_length_days?: number
          cycle_start_date?: string
          follicular_days?: number | null
          id?: string
          luteal_days?: number | null
          menstruation_days?: number | null
          ovulation_days?: number | null
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
      daily_home_insights: {
        Row: {
          context_key: string
          created_at: string
          dont_me_text: string | null
          dont_mess_up_him_text: string | null
          dont_mess_up_partner_text: string | null
          dont_mess_up_text: string
          generated_at: string
          headline_text: string | null
          help_me_text: string | null
          id: string
          local_date: string
          subline_text: string | null
          succeed_him_text: string | null
          succeed_partner_text: string | null
          succeed_text: string
          user_id: string
        }
        Insert: {
          context_key: string
          created_at?: string
          dont_me_text?: string | null
          dont_mess_up_him_text?: string | null
          dont_mess_up_partner_text?: string | null
          dont_mess_up_text: string
          generated_at?: string
          headline_text?: string | null
          help_me_text?: string | null
          id?: string
          local_date: string
          subline_text?: string | null
          succeed_him_text?: string | null
          succeed_partner_text?: string | null
          succeed_text: string
          user_id: string
        }
        Update: {
          context_key?: string
          created_at?: string
          dont_me_text?: string | null
          dont_mess_up_him_text?: string | null
          dont_mess_up_partner_text?: string | null
          dont_mess_up_text?: string
          generated_at?: string
          headline_text?: string | null
          help_me_text?: string | null
          id?: string
          local_date?: string
          subline_text?: string | null
          succeed_him_text?: string | null
          succeed_partner_text?: string | null
          succeed_text?: string
          user_id?: string
        }
        Relationships: []
      }
      distress_mode_daily_counts: {
        Row: {
          count: number
          day: string
          kind: string
        }
        Insert: {
          count?: number
          day: string
          kind: string
        }
        Update: {
          count?: number
          day?: string
          kind?: string
        }
        Relationships: []
      }
      email_opens: {
        Row: {
          id: string
          ip: string | null
          message_id: string
          opened_at: string
          recipient_email: string | null
          template_name: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          ip?: string | null
          message_id: string
          opened_at?: string
          recipient_email?: string | null
          template_name?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          ip?: string | null
          message_id?: string
          opened_at?: string
          recipient_email?: string | null
          template_name?: string | null
          user_agent?: string | null
        }
        Relationships: []
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
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      feature_requests: {
        Row: {
          created_at: string
          feature: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature?: string
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
      feedback_prompt_state: {
        Row: {
          created_at: string
          last_dismissed_at: string | null
          last_shown_at: string | null
          sessions_since_shown: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_dismissed_at?: string | null
          last_shown_at?: string | null
          sessions_since_shown?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_dismissed_at?: string | null
          last_shown_at?: string | null
          sessions_since_shown?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      growth_tracker: {
        Row: {
          actual_user_count: number
          created_at: string
          date: string
          id: string
        }
        Insert: {
          actual_user_count: number
          created_at?: string
          date: string
          id?: string
        }
        Update: {
          actual_user_count?: number
          created_at?: string
          date?: string
          id?: string
        }
        Relationships: []
      }
      headsup_people: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          relationship: string | null
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          relationship?: string | null
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          relationship?: string | null
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      history_imports: {
        Row: {
          completed_at: string | null
          created_at: string
          cycles_imported: number
          date_range_end: string | null
          date_range_start: string | null
          error_message: string | null
          id: string
          source: string
          status: string
          storage_path: string | null
          symptom_days_imported: number
          tracker_logs_imported: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          cycles_imported?: number
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          id?: string
          source: string
          status?: string
          storage_path?: string | null
          symptom_days_imported?: number
          tracker_logs_imported?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          cycles_imported?: number
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          id?: string
          source?: string
          status?: string
          storage_path?: string | null
          symptom_days_imported?: number
          tracker_logs_imported?: number
          user_id?: string
        }
        Relationships: []
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
      insight_feedback_events: {
        Row: {
          action: string
          created_at: string
          id: string
          insight_type: string | null
          message_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          insight_type?: string | null
          message_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          insight_type?: string | null
          message_id?: string
          user_id?: string
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
      lab_markers: {
        Row: {
          category: string | null
          created_at: string
          flag: string | null
          id: string
          marker_key: string | null
          name: string
          panel_id: string
          ref_high: number | null
          ref_low: number | null
          unit: string | null
          user_id: string
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          marker_key?: string | null
          name: string
          panel_id: string
          ref_high?: number | null
          ref_low?: number | null
          unit?: string | null
          user_id: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          marker_key?: string | null
          name?: string
          panel_id?: string
          ref_high?: number | null
          ref_low?: number | null
          unit?: string | null
          user_id?: string
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_markers_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "lab_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_panels: {
        Row: {
          created_at: string
          id: string
          lab_name: string | null
          notes: string | null
          source: string
          storage_path: string | null
          taken_on: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lab_name?: string | null
          notes?: string | null
          source?: string
          storage_path?: string | null
          taken_on?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lab_name?: string | null
          notes?: string | null
          source?: string
          storage_path?: string | null
          taken_on?: string | null
          user_id?: string
        }
        Relationships: []
      }
      link_clicks: {
        Row: {
          clicked_at: string
          id: number
          slug: string
        }
        Insert: {
          clicked_at?: string
          id?: never
          slug: string
        }
        Update: {
          clicked_at?: string
          id?: never
          slug?: string
        }
        Relationships: []
      }
      meals: {
        Row: {
          ai_confidence: string | null
          calories: number
          carbs_g: number
          created_at: string
          description: string | null
          fat_g: number
          id: string
          image_path: string | null
          logged_at: string
          name: string
          protein_g: number
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_confidence?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string
          description?: string | null
          fat_g?: number
          id?: string
          image_path?: string | null
          logged_at?: string
          name: string
          protein_g?: number
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_confidence?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string
          description?: string | null
          fat_g?: number
          id?: string
          image_path?: string | null
          logged_at?: string
          name?: string
          protein_g?: number
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      message_failures: {
        Row: {
          created_at: string
          error: string | null
          id: string
          message_type: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          message_type?: string | null
          source?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          message_type?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: []
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
      nutrition_goals: {
        Row: {
          activity_level: string | null
          age: number | null
          auto_calculated: boolean
          calorie_target: number | null
          carbs_target_g: number | null
          created_at: string
          fat_target_g: number | null
          height_cm: number | null
          protein_target_g: number | null
          updated_at: string
          user_id: string
          weight_goal_direction: string | null
          weight_goal_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          auto_calculated?: boolean
          calorie_target?: number | null
          carbs_target_g?: number | null
          created_at?: string
          fat_target_g?: number | null
          height_cm?: number | null
          protein_target_g?: number | null
          updated_at?: string
          user_id: string
          weight_goal_direction?: string | null
          weight_goal_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          auto_calculated?: boolean
          calorie_target?: number | null
          carbs_target_g?: number | null
          created_at?: string
          fat_target_g?: number | null
          height_cm?: number | null
          protein_target_g?: number | null
          updated_at?: string
          user_id?: string
          weight_goal_direction?: string | null
          weight_goal_kg?: number | null
        }
        Relationships: []
      }
      participants: {
        Row: {
          additional_notes: string | null
          age: number | null
          anchor_symptom: string | null
          birth_control_method: string | null
          birth_control_method_asked_at: string | null
          birth_control_status: string | null
          consent_given: boolean | null
          consent_given_at: string | null
          created_at: string
          current_period_end_date: string | null
          cycle_anchor_type: string
          cycle_length_days: number | null
          cycle_length_user_override: boolean
          cycle_regularity: string | null
          cycle_return_status: string | null
          due_date: string | null
          email: string | null
          feeding_status: string | null
          follicular_days: number | null
          full_name: string
          goals: string[] | null
          has_uterus: boolean | null
          id: string
          is_active: boolean | null
          is_breastfeeding: boolean | null
          last_period_start: string | null
          life_stage: string
          loss_date: string | null
          luteal_days: number | null
          menstruation_days: number | null
          on_hormonal_bc: boolean | null
          ovulation_window_days: number | null
          period_pending_since: string | null
          period_still_active: boolean
          postpartum_active: boolean
          postpartum_regular_periods_confirmed: boolean
          postpartum_start_date: string | null
          preferred_channel: string | null
          pregnancy_lmp: string | null
          telegram_chat_id: string | null
          theme_preference: string
          timezone: string | null
          typical_symptoms: string[] | null
          updated_at: string
          user_id: string | null
          watch_symptoms: string[]
          whatsapp_number: string
        }
        Insert: {
          additional_notes?: string | null
          age?: number | null
          anchor_symptom?: string | null
          birth_control_method?: string | null
          birth_control_method_asked_at?: string | null
          birth_control_status?: string | null
          consent_given?: boolean | null
          consent_given_at?: string | null
          created_at?: string
          current_period_end_date?: string | null
          cycle_anchor_type?: string
          cycle_length_days?: number | null
          cycle_length_user_override?: boolean
          cycle_regularity?: string | null
          cycle_return_status?: string | null
          due_date?: string | null
          email?: string | null
          feeding_status?: string | null
          follicular_days?: number | null
          full_name: string
          goals?: string[] | null
          has_uterus?: boolean | null
          id?: string
          is_active?: boolean | null
          is_breastfeeding?: boolean | null
          last_period_start?: string | null
          life_stage?: string
          loss_date?: string | null
          luteal_days?: number | null
          menstruation_days?: number | null
          on_hormonal_bc?: boolean | null
          ovulation_window_days?: number | null
          period_pending_since?: string | null
          period_still_active?: boolean
          postpartum_active?: boolean
          postpartum_regular_periods_confirmed?: boolean
          postpartum_start_date?: string | null
          preferred_channel?: string | null
          pregnancy_lmp?: string | null
          telegram_chat_id?: string | null
          theme_preference?: string
          timezone?: string | null
          typical_symptoms?: string[] | null
          updated_at?: string
          user_id?: string | null
          watch_symptoms?: string[]
          whatsapp_number: string
        }
        Update: {
          additional_notes?: string | null
          age?: number | null
          anchor_symptom?: string | null
          birth_control_method?: string | null
          birth_control_method_asked_at?: string | null
          birth_control_status?: string | null
          consent_given?: boolean | null
          consent_given_at?: string | null
          created_at?: string
          current_period_end_date?: string | null
          cycle_anchor_type?: string
          cycle_length_days?: number | null
          cycle_length_user_override?: boolean
          cycle_regularity?: string | null
          cycle_return_status?: string | null
          due_date?: string | null
          email?: string | null
          feeding_status?: string | null
          follicular_days?: number | null
          full_name?: string
          goals?: string[] | null
          has_uterus?: boolean | null
          id?: string
          is_active?: boolean | null
          is_breastfeeding?: boolean | null
          last_period_start?: string | null
          life_stage?: string
          loss_date?: string | null
          luteal_days?: number | null
          menstruation_days?: number | null
          on_hormonal_bc?: boolean | null
          ovulation_window_days?: number | null
          period_pending_since?: string | null
          period_still_active?: boolean
          postpartum_active?: boolean
          postpartum_regular_periods_confirmed?: boolean
          postpartum_start_date?: string | null
          preferred_channel?: string | null
          pregnancy_lmp?: string | null
          telegram_chat_id?: string | null
          theme_preference?: string
          timezone?: string | null
          typical_symptoms?: string[] | null
          updated_at?: string
          user_id?: string | null
          watch_symptoms?: string[]
          whatsapp_number?: string
        }
        Relationships: []
      }
      partner_headsup_events: {
        Row: {
          checkin_sent_at: string | null
          created_at: string
          focus: string[] | null
          id: string
          kind: string
          low_confidence: boolean
          notified_at: string | null
          opened_at: string | null
          outcome: string | null
          predicted_period_start: string | null
          recipient_name: string | null
          sent_at: string | null
          status: string
          user_id: string
          window_end: string | null
          window_start: string
        }
        Insert: {
          checkin_sent_at?: string | null
          created_at?: string
          focus?: string[] | null
          id?: string
          kind?: string
          low_confidence?: boolean
          notified_at?: string | null
          opened_at?: string | null
          outcome?: string | null
          predicted_period_start?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status: string
          user_id: string
          window_end?: string | null
          window_start: string
        }
        Update: {
          checkin_sent_at?: string | null
          created_at?: string
          focus?: string[] | null
          id?: string
          kind?: string
          low_confidence?: boolean
          notified_at?: string | null
          opened_at?: string | null
          outcome?: string | null
          predicted_period_start?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
          window_end?: string | null
          window_start?: string
        }
        Relationships: []
      }
      partner_headsup_settings: {
        Row: {
          consent_at: string | null
          created_at: string
          enabled: boolean
          helps: string[]
          id: string
          include_dates: boolean
          include_footer: boolean
          include_helps: boolean
          include_mood: boolean
          offer_before_harder_days: boolean
          offer_on_hard_days: boolean
          partner_name: string | null
          paused_until: string | null
          relationship: string | null
          timing: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          enabled?: boolean
          helps?: string[]
          id?: string
          include_dates?: boolean
          include_footer?: boolean
          include_helps?: boolean
          include_mood?: boolean
          offer_before_harder_days?: boolean
          offer_on_hard_days?: boolean
          partner_name?: string | null
          paused_until?: string | null
          relationship?: string | null
          timing?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          enabled?: boolean
          helps?: string[]
          id?: string
          include_dates?: boolean
          include_footer?: boolean
          include_helps?: boolean
          include_mood?: boolean
          offer_before_harder_days?: boolean
          offer_on_hard_days?: boolean
          partner_name?: string | null
          paused_until?: string | null
          relationship?: string | null
          timing?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      partner_headsup_style_examples: {
        Row: {
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      policy_notifications: {
        Row: {
          created_at: string
          email_sent_at: string
          id: string
          policy_version: string
          recipient_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email_sent_at?: string
          id?: string
          policy_version: string
          recipient_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email_sent_at?: string
          id?: string
          policy_version?: string
          recipient_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          analytics_consent: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_internal: boolean
          landing_at: string | null
          landing_path: string | null
          marketing_opt_out: boolean
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          referrer: string | null
          together_consent: boolean
          together_consent_at: string | null
          together_consent_shown_at: string | null
          together_consent_version: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          analytics_consent?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_internal?: boolean
          landing_at?: string | null
          landing_path?: string | null
          marketing_opt_out?: boolean
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          referrer?: string | null
          together_consent?: boolean
          together_consent_at?: string | null
          together_consent_shown_at?: string | null
          together_consent_version?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          analytics_consent?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_internal?: boolean
          landing_at?: string | null
          landing_path?: string | null
          marketing_opt_out?: boolean
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          referrer?: string | null
          together_consent?: boolean
          together_consent_at?: string | null
          together_consent_shown_at?: string | null
          together_consent_version?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token: string
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
      referral_code_attempts: {
        Row: {
          attempted_at: string
          id: number
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: number
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: number
          user_id?: string
        }
        Relationships: []
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
      short_links: {
        Row: {
          clicks: number
          created_at: string
          created_by: string | null
          id: string
          slug: string
          target_url: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          clicks?: number
          created_at?: string
          created_by?: string | null
          id?: string
          slug: string
          target_url: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          clicks?: number
          created_at?: string
          created_by?: string | null
          id?: string
          slug?: string
          target_url?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
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
      symptom_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          main_name: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          main_name: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          main_name?: string
        }
        Relationships: []
      }
      symptom_candidate_rejections: {
        Row: {
          candidate_name: string
          created_at: string
          id: string
          matched_existing: string | null
          normalized_name: string | null
          reason: string
          source: string
          user_id: string | null
        }
        Insert: {
          candidate_name: string
          created_at?: string
          id?: string
          matched_existing?: string | null
          normalized_name?: string | null
          reason: string
          source?: string
          user_id?: string | null
        }
        Update: {
          candidate_name?: string
          created_at?: string
          id?: string
          matched_existing?: string | null
          normalized_name?: string | null
          reason?: string
          source?: string
          user_id?: string | null
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
      symptom_reports: {
        Row: {
          community_symptom_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
        }
        Insert: {
          community_symptom_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
        }
        Update: {
          community_symptom_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "symptom_reports_community_symptom_id_fkey"
            columns: ["community_symptom_id"]
            isOneToOne: false
            referencedRelation: "community_symptoms"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          body: string
          created_at: string
          draft_id: string | null
          id: string
          kind: string | null
          read_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          draft_id?: string | null
          id?: string
          kind?: string | null
          read_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          draft_id?: string | null
          id?: string
          kind?: string | null
          read_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      together_daily_aggregates: {
        Row: {
          cohort_key: string
          cohort_kind: string
          cohort_women: number
          computed_on: string
          created_at: string
          day_shares: Json | null
          id: number
          symptom: string
          women_band: string
          women_count: number | null
        }
        Insert: {
          cohort_key: string
          cohort_kind: string
          cohort_women: number
          computed_on: string
          created_at?: string
          day_shares?: Json | null
          id?: number
          symptom: string
          women_band: string
          women_count?: number | null
        }
        Update: {
          cohort_key?: string
          cohort_kind?: string
          cohort_women?: number
          computed_on?: string
          created_at?: string
          day_shares?: Json | null
          id?: number
          symptom?: string
          women_band?: string
          women_count?: number | null
        }
        Relationships: []
      }
      together_daily_pairs: {
        Row: {
          computed_on: string
          symptom_a: string
          symptom_b: string
          women_count: number
        }
        Insert: {
          computed_on?: string
          symptom_a: string
          symptom_b: string
          women_count: number
        }
        Update: {
          computed_on?: string
          symptom_a?: string
          symptom_b?: string
          women_count?: number
        }
        Relationships: []
      }
      together_tip_hidden_authors: {
        Row: {
          author_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      together_tip_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          tip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          tip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          tip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "together_tip_reports_tip_id_fkey"
            columns: ["tip_id"]
            isOneToOne: false
            referencedRelation: "together_tips"
            referencedColumns: ["id"]
          },
        ]
      }
      together_tip_votes: {
        Row: {
          created_at: string
          tip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "together_tip_votes_tip_id_fkey"
            columns: ["tip_id"]
            isOneToOne: false
            referencedRelation: "together_tips"
            referencedColumns: ["id"]
          },
        ]
      }
      together_tips: {
        Row: {
          author_id: string
          created_at: string
          first_reported_at: string | null
          id: string
          label: string
          needs_review: boolean
          original_text: string | null
          reject_reason: string | null
          report_count: number
          reviewed_at: string | null
          stage_key: string | null
          status: string
          symptom: string
          text: string
        }
        Insert: {
          author_id: string
          created_at?: string
          first_reported_at?: string | null
          id?: string
          label?: string
          needs_review?: boolean
          original_text?: string | null
          reject_reason?: string | null
          report_count?: number
          reviewed_at?: string | null
          stage_key?: string | null
          status?: string
          symptom: string
          text: string
        }
        Update: {
          author_id?: string
          created_at?: string
          first_reported_at?: string | null
          id?: string
          label?: string
          needs_review?: boolean
          original_text?: string | null
          reject_reason?: string | null
          report_count?: number
          reviewed_at?: string | null
          stage_key?: string | null
          status?: string
          symptom?: string
          text?: string
        }
        Relationships: []
      }
      together_word_events: {
        Row: {
          day: string
          event: string
          id: number
          reason: string | null
        }
        Insert: {
          day?: string
          event: string
          id?: number
          reason?: string | null
        }
        Update: {
          day?: string
          event?: string
          id?: number
          reason?: string | null
        }
        Relationships: []
      }
      together_word_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          word_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          word_key: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          word_key?: string
        }
        Relationships: []
      }
      together_word_review: {
        Row: {
          blocked: boolean
          needs_review: boolean
          report_count: number
          reviewed_at: string | null
          word_key: string
        }
        Insert: {
          blocked?: boolean
          needs_review?: boolean
          report_count?: number
          reviewed_at?: string | null
          word_key: string
        }
        Update: {
          blocked?: boolean
          needs_review?: boolean
          report_count?: number
          reviewed_at?: string | null
          word_key?: string
        }
        Relationships: []
      }
      together_words: {
        Row: {
          checked_at: string | null
          created_at: string
          id: string
          kind: string
          original_word: string
          reject_category: string | null
          source_key: string
          status: string
          updated_at: string
          user_id: string
          word: string
          word_key: string
        }
        Insert: {
          checked_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          original_word: string
          reject_category?: string | null
          source_key: string
          status?: string
          updated_at?: string
          user_id: string
          word: string
          word_key: string
        }
        Update: {
          checked_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          original_word?: string
          reject_category?: string | null
          source_key?: string
          status?: string
          updated_at?: string
          user_id?: string
          word?: string
          word_key?: string
        }
        Relationships: []
      }
      tracker_logs: {
        Row: {
          created_at: string
          cycle_day: number | null
          cycle_phase: string | null
          id: string
          intensity: number | null
          logged_at: string
          notes: string | null
          option_value: string | null
          tracker_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_day?: number | null
          cycle_phase?: string | null
          id?: string
          intensity?: number | null
          logged_at?: string
          notes?: string | null
          option_value?: string | null
          tracker_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_day?: number | null
          cycle_phase?: string | null
          id?: string
          intensity?: number | null
          logged_at?: string
          notes?: string | null
          option_value?: string | null
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
          channel: string
          consent_at: string | null
          consent_copy_version: string | null
          created_at: string
          handled_at: string | null
          handled_by: string | null
          health_consent: boolean | null
          health_detected: boolean | null
          id: string
          message: string
          message_clean: string | null
          theme: string | null
          topic: string | null
          user_id: string
        }
        Insert: {
          category?: string
          channel?: string
          consent_at?: string | null
          consent_copy_version?: string | null
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          health_consent?: boolean | null
          health_detected?: boolean | null
          id?: string
          message: string
          message_clean?: string | null
          theme?: string | null
          topic?: string | null
          user_id: string
        }
        Update: {
          category?: string
          channel?: string
          consent_at?: string | null
          consent_copy_version?: string | null
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          health_consent?: boolean | null
          health_detected?: boolean | null
          id?: string
          message?: string
          message_clean?: string | null
          theme?: string | null
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_hidden_symptoms: {
        Row: {
          community_symptom_id: string
          hidden_at: string
          id: string
          user_id: string
        }
        Insert: {
          community_symptom_id: string
          hidden_at?: string
          id?: string
          user_id: string
        }
        Update: {
          community_symptom_id?: string
          hidden_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hidden_symptoms_community_symptom_id_fkey"
            columns: ["community_symptom_id"]
            isOneToOne: false
            referencedRelation: "community_symptoms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_integrations: {
        Row: {
          access_token: string
          connected_at: string
          created_at: string
          expires_at: string | null
          id: string
          last_synced_at: string | null
          provider: string
          provider_user_id: string | null
          refresh_token: string | null
          scopes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          provider_user_id?: string | null
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          provider_user_id?: string | null
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_memory_notes: {
        Row: {
          active: boolean
          created_at: string
          id: string
          note: string
          source: string
          source_message_id: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          note: string
          source?: string
          source_message_id?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          note?: string
          source?: string
          source_message_id?: string | null
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
      user_topic_boundaries: {
        Row: {
          active: boolean
          created_at: string
          deactivated_at: string | null
          id: string
          kind: string
          label: string
          source_message_id: string | null
          stage_key: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deactivated_at?: string | null
          id?: string
          kind: string
          label: string
          source_message_id?: string | null
          stage_key?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deactivated_at?: string | null
          id?: string
          kind?: string
          label?: string
          source_message_id?: string | null
          stage_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_topic_boundaries_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_word_prefs: {
        Row: {
          created_at: string
          id: string
          new_name: string | null
          original_word: string
          removed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_name?: string | null
          original_word: string
          removed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_name?: string | null
          original_word?: string
          removed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          context: string | null
          created_at: string
          email: string
          id: string
          source: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          created_at: string
          id: string
          logged_on: string
          note: string | null
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      short_links_public: {
        Row: {
          slug: string | null
          target_url: string | null
        }
        Insert: {
          slug?: string | null
          target_url?: string | null
        }
        Update: {
          slug?: string | null
          target_url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _admin_came_from: {
        Args: {
          _campaign: string
          _referred_by: string
          _referrer: string
          _source: string
        }
        Returns: string
      }
      _admin_deliver_team_message: {
        Args: { _body: string; _draft: string; _kind: string; _user: string }
        Returns: undefined
      }
      _admin_eligible_users: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      _admin_is_onboarded: { Args: { _user: string }; Returns: boolean }
      _admin_is_super: { Args: never; Returns: boolean }
      _admin_onboarded_users: {
        Args: never
        Returns: {
          conflicting: boolean
          onboarded_at: string
          referred_by: string
          stage: string
          user_id: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
        }[]
      }
      _admin_referred: {
        Args: never
        Returns: {
          in_base: boolean
          in_month: boolean
          is_active: boolean
          onboarded_at: string
          referrer: string
          user_id: string
        }[]
      }
      _admin_short_name: { Args: { _full: string }; Returns: string }
      _admin_small: {
        Args: { _filtered: boolean; _n: number }
        Returns: number
      }
      _admin_user_events: {
        Args: { _from: string; _to: string }
        Returns: {
          from_chat: boolean
          ts: string
          user_id: string
        }[]
      }
      _admin_user_events_any: {
        Args: { _from: string; _user?: string }
        Returns: {
          from_chat: boolean
          ts: string
          user_id: string
        }[]
      }
      _admin_user_rows: {
        Args: never
        Returns: {
          came_from: string
          display_name: string
          email: string
          is_internal: boolean
          joined_at: string
          last_active_at: string
          msgs_30d: number
          referrals: number
          user_id: string
        }[]
      }
      _admin_words_waiting: { Args: never; Returns: number }
      _broadcast_audience_clean: { Args: { _aud: Json }; Returns: Json }
      _broadcast_audience_count: { Args: { _aud: Json }; Returns: number }
      _broadcast_audience_label: { Args: { _aud: Json }; Returns: string }
      _broadcast_audience_users: {
        Args: { _aud: Json }
        Returns: {
          user_id: string
        }[]
      }
      _broadcast_deliver: {
        Args: { _aud: Json; _body: string; _draft: string }
        Returns: number
      }
      _feedback_needing_clean: {
        Args: { _limit: number }
        Returns: {
          id: string
          message: string
          message_clean: string
        }[]
      }
      _feedback_needing_clean_count: { Args: never; Returns: number }
      _feedback_text_state: {
        Args: { _f: Database["public"]["Tables"]["user_feedback"]["Row"] }
        Returns: string
      }
      _feedback_visible_text: {
        Args: {
          _f: Database["public"]["Tables"]["user_feedback"]["Row"]
          _super: boolean
        }
        Returns: string
      }
      _log_together_event: {
        Args: { _event: string; _reason?: string }
        Returns: undefined
      }
      _symptoms_has_word: { Args: { _k: string; _s: Json }; Returns: boolean }
      _visible_symptom_ids: { Args: { _uid: string }; Returns: string[] }
      admin_active_users_in_range: {
        Args: { _from: string; _to: string }
        Returns: number
      }
      admin_active_users_now: {
        Args: never
        Returns: {
          dau: number
          mau: number
          wau: number
        }[]
      }
      admin_broadcast_approve_send: {
        Args: { _draft: string }
        Returns: number
      }
      admin_broadcast_count: { Args: { _audience: Json }; Returns: number }
      admin_broadcast_draft_create: {
        Args: { _audience: Json; _body: string }
        Returns: string
      }
      admin_broadcast_history: {
        Args: never
        Returns: {
          audience_label: string
          body: string
          created_at: string
          id: string
          recipient_count: number
          sent_at: string
          sent_by: string
          status: string
          written_by: string
        }[]
      }
      admin_broadcast_send_direct: {
        Args: { _audience: Json; _body: string; _id: string }
        Returns: number
      }
      admin_broadcast_send_test: { Args: { _body: string }; Returns: undefined }
      admin_campaign_links: {
        Args: { _from: string; _to: string }
        Returns: {
          clicks: number
          created_at: string
          signups: number
          slug: string
          target_url: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
        }[]
      }
      admin_daily_activity: {
        Args: { _from: string; _to: string }
        Returns: {
          active_users: number
          day: string
          sessions: number
          user_messages: number
        }[]
      }
      admin_draft_approve_send: { Args: { _draft: string }; Returns: undefined }
      admin_draft_create: {
        Args: {
          _body: string
          _feedback?: string
          _kind: string
          _user?: string
        }
        Returns: string
      }
      admin_draft_edit: {
        Args: { _body: string; _draft: string }
        Returns: undefined
      }
      admin_draft_list_waiting: {
        Args: never
        Returns: {
          audience: Json
          audience_label: string
          body: string
          created_at: string
          feedback_id: string
          feedback_text: string
          first_name: string
          id: string
          kind: string
          last_initial: string
          recipient_count: number
          user_id: string
          written_by: string
        }[]
      }
      admin_draft_reject: { Args: { _draft: string }; Returns: undefined }
      admin_feedback_counts: {
        Args: { _tab: string }
        Returns: {
          key: string
          n: number
          scope: string
        }[]
      }
      admin_feedback_list: {
        Args: { _tab: string; _theme?: string }
        Returns: {
          channel: string
          created_at: string
          first_name: string
          handled: boolean
          id: string
          last_initial: string
          text_shown: string
          text_state: string
          theme: string
          topic: string
          user_id: string
        }[]
      }
      admin_feedback_mark_handled: {
        Args: { _handled?: boolean; _id: string }
        Returns: undefined
      }
      admin_feedback_set_theme: {
        Args: { _id: string; _theme: string }
        Returns: undefined
      }
      admin_get_goal: {
        Args: never
        Returns: {
          goal_count: number
          goal_date: string
        }[]
      }
      admin_leftover_rows: {
        Args: { _user_id: string }
        Returns: {
          row_count: number
          table_name: string
        }[]
      }
      admin_life_stage_activity: {
        Args: never
        Returns: {
          active_30: number
          active_7: number
          active_days_30: number
          conflicting: number
          grp: string
          minutes_30: number
          retained: number
          retention_base: number
          sessions_30: number
          users: number
        }[]
      }
      admin_log_action: {
        Args: { _action: string; _target: string }
        Returns: undefined
      }
      admin_measurement_weekly: {
        Args: { _weeks?: number }
        Returns: {
          active_user_days: number
          active_users: number
          headsups_sent: number
          insights_confirmed: number
          insights_corrected: number
          insights_not_confirmed: number
          insights_shown: number
          reactions_negative: number
          reactions_positive: number
          week: string
        }[]
      }
      admin_needs_you: {
        Args: never
        Returns: {
          click_counting_since: string
          link_clicks_total: number
          link_count: number
          message_failures_7d: number
          new_feedback: number
          new_referrers_week: number
          tips_reported: number
          tips_waiting: number
        }[]
      }
      admin_onboarded_by_day: {
        Args: { _from: string; _to: string }
        Returns: {
          day: string
          new_users: number
          total_users: number
        }[]
      }
      admin_referral_thank_you: {
        Args: { _body: string; _ref_key: string }
        Returns: string
      }
      admin_referrals_list: {
        Args: { _period: string }
        Returns: {
          active: number
          active_base: number
          all_time: number
          first_name: string
          last_initial: string
          last_referral: string
          ref_key: string
          signups: number
          thanked_at: string
          user_id: string
        }[]
      }
      admin_referrals_summary: {
        Args: { _period: string }
        Returns: {
          active: number
          active_base: number
          referrers: number
          signups: number
        }[]
      }
      admin_review_tip: {
        Args: { _action: string; _tip_id: string }
        Returns: number
      }
      admin_review_word: {
        Args: { _action: string; _word: string }
        Returns: number
      }
      admin_send_team_message: {
        Args: {
          _body: string
          _feedback?: string
          _kind?: string
          _user: string
        }
        Returns: string
      }
      admin_set_goal: {
        Args: { _count: number; _date: string }
        Returns: undefined
      }
      admin_set_user_internal: {
        Args: { _internal: boolean; _user_id: string }
        Returns: undefined
      }
      admin_signup_sources: {
        Args: { _by: string; _from: string; _stage?: string; _to: string }
        Returns: {
          active_14d: number
          active_14d_base: number
          clicks: number
          signups: number
          source: string
        }[]
      }
      admin_symptom_log_activity: {
        Args: { _from?: string; _to?: string }
        Returns: {
          day: string
          logs: number
          women: number
        }[]
      }
      admin_time_spent: {
        Args: { _from: string; _to: string }
        Returns: {
          minutes: number
          minutes_rounded: number
          sessions: number
        }[]
      }
      admin_tip_queue: {
        Args: { _tab?: string }
        Returns: {
          author_tip_count: number
          created_at: string
          id: string
          label: string
          reasons: string[]
          report_count: number
          status: string
          symptom: string
          text: string
          why: string
        }[]
      }
      admin_tip_totals: {
        Args: never
        Returns: {
          status: string
          total: number
        }[]
      }
      admin_together_strip: {
        Args: never
        Returns: {
          new_words_week: number
          symptoms_10_plus: number
          tips_live: number
          tips_reported: number
          tips_waiting: number
          women_joined: number
        }[]
      }
      admin_together_totals: {
        Args: never
        Returns: {
          cohort_key: string
          cohort_kind: string
          cohort_women: number
          computed_on: string
          consenting_women: number
          symptom: string
          women_band: string
          women_count: number
        }[]
      }
      admin_together_word_event_totals: {
        Args: { _days?: number }
        Returns: {
          event: string
          reason: string
          total: number
        }[]
      }
      admin_user_detail: {
        Args: { _user_id: string }
        Returns: {
          came_from: string
          email: string
          feedback_count: number
          full_name: string
          headsups_sent: number
          health_consent: boolean
          health_consent_at: string
          is_internal: boolean
          joined_at: string
          last_active_at: string
          marketing_on: boolean
          msgs_30d: number
          referrals_active: number
          referrals_invited: number
          sessions_30d: number
          tips_live: number
          tips_reported: number
          together_consent: boolean
          together_consent_at: string
          together_consent_version: string
          user_id: string
        }[]
      }
      admin_user_set_internal: {
        Args: { _internal: boolean; _user_id: string }
        Returns: undefined
      }
      admin_user_set_name: {
        Args: { _name: string; _user_id: string }
        Returns: undefined
      }
      admin_users_export: {
        Args: {
          _filter?: string
          _hide_internal?: boolean
          _search?: string
          _sort?: string
        }
        Returns: {
          came_from: string
          display_name: string
          email: string
          joined_at: string
          last_active_at: string
          msgs_30d: number
          referrals: number
        }[]
      }
      admin_users_list: {
        Args: {
          _filter?: string
          _hide_internal?: boolean
          _limit?: number
          _offset?: number
          _search?: string
          _sort?: string
        }
        Returns: {
          came_from: string
          display_name: string
          is_internal: boolean
          joined_at: string
          last_active_at: string
          msgs_30d: number
          referrals: number
          total_count: number
          user_id: string
        }[]
      }
      admin_week_to_date: {
        Args: never
        Returns: {
          active_week: number
          new_week: number
          week_start: string
        }[]
      }
      admin_weekly_active_users: {
        Args: { _from: string; _to: string }
        Returns: {
          active_users: number
          days_in_range: number
          week_start: string
        }[]
      }
      admin_weekly_measurement: {
        Args: { _from: string; _stage?: string; _to: string }
        Returns: {
          active_users: number
          feedback: number
          headsups_opened: number
          new_users: number
          returned: number
          returned_base: number
          week_start: string
        }[]
      }
      admin_word_queue: {
        Args: never
        Returns: {
          reasons: string[]
          report_count: number
          status: string
          word: string
        }[]
      }
      apply_manual_referral_code: { Args: never; Returns: boolean }
      count_hidden_tip_authors: { Args: never; Returns: number }
      count_onboarded_users: { Args: never; Returns: number }
      delete_my_tips: { Args: never; Returns: undefined }
      evaluate_postpartum_regularity: {
        Args: { _participant_id: string }
        Returns: boolean
      }
      generate_referral_code: { Args: never; Returns: string }
      get_auth_email: { Args: never; Returns: string }
      get_referral_count:
        | { Args: never; Returns: number }
        | { Args: { _user_id: string }; Returns: number }
      get_symptom_name_map: {
        Args: never
        Returns: {
          canonical_id: string
          id: string
          name: string
          status: string
        }[]
      }
      get_tip_summary: {
        Args: { _symptom: string }
        Returns: {
          tip_count: number
          top_helped: number
        }[]
      }
      get_together_aggregates: {
        Args: never
        Returns: {
          cohort_key: string
          cohort_women: number
          computed_on: string
          day_shares: Json
          filter: string
          symptom: string
          women_band: string
          women_count: number
        }[]
      }
      get_together_pairs: {
        Args: never
        Returns: {
          symptom_a: string
          symptom_b: string
          women_count: number
        }[]
      }
      get_together_tips: {
        Args: { _symptom: string }
        Returns: {
          created_at: string
          helped: number
          helped_by_me: boolean
          id: string
          label: string
          mine: boolean
          same_stage: boolean
          text: string
        }[]
      }
      get_together_words: {
        Args: never
        Returns: {
          label: string
          mine: boolean
          women_count: number
          word: string
        }[]
      }
      get_visible_symptoms: {
        Args: never
        Returns: {
          aliases: string[]
          canonical_id: string
          category: string
          id: string
          name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hide_tip_author: { Args: { _tip_id: string }; Returns: undefined }
      keep_together_v2: { Args: never; Returns: boolean }
      leave_together_v2: { Args: never; Returns: boolean }
      mark_team_messages_read: { Args: never; Returns: undefined }
      purge_together_words: { Args: { _uid: string }; Returns: undefined }
      record_distress_event: { Args: { _kind: string }; Returns: undefined }
      record_link_click: { Args: { _slug: string }; Returns: undefined }
      refresh_postpartum_state: {
        Args: { _participant_id: string }
        Returns: undefined
      }
      refresh_together_aggregates: { Args: never; Returns: undefined }
      report_tip: {
        Args: { _reason: string; _tip_id: string }
        Returns: undefined
      }
      report_word: {
        Args: { _reason: string; _word: string }
        Returns: undefined
      }
      resolve_referral_code: { Args: { _code: string }; Returns: boolean }
      set_feedback_consent: {
        Args: { _allow: boolean; _id: string }
        Returns: undefined
      }
      tip_own_cycles: {
        Args: { _symptom: string; _user_id: string }
        Returns: number
      }
      together_canonical: { Args: { _name: string }; Returns: string }
      together_library_map: {
        Args: never
        Returns: {
          canonical: string
          retired: boolean
          src: string
        }[]
      }
      together_norm: { Args: { _name: string }; Returns: string }
      together_stage: {
        Args: { _due: string; _life_stage: string; _lmp: string; _pp: string }
        Returns: string
      }
      toggle_tip_vote: { Args: { _tip_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user", "super_admin"],
      insight_status: ["pending", "approved", "rejected", "sent"],
      resource_status: ["generating", "ready", "failed"],
      resource_type: ["meal_plan", "training_program", "meditation", "planner"],
    },
  },
} as const
