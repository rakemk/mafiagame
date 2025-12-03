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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      actions: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string | null
          id: string
          room_id: string | null
          round_number: number
          target_id: string | null
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          room_id?: string | null
          round_number: number
          target_id?: string | null
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          room_id?: string | null
          round_number?: number
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_states: {
        Row: {
          created_at: string | null
          id: string
          phase: Database["public"]["Enums"]["game_phase"] | null
          phase_end_time: string | null
          room_id: string | null
          round_number: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          phase?: Database["public"]["Enums"]["game_phase"] | null
          phase_end_time?: string | null
          room_id?: string | null
          round_number?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          phase?: Database["public"]["Enums"]["game_phase"] | null
          phase_end_time?: string | null
          room_id?: string | null
          round_number?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_states_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          message_type: string | null
          player_id: string | null
          player_name: string
          room_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          player_id?: string | null
          player_name: string
          room_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          player_id?: string | null
          player_name?: string
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          id: string
          is_ready: boolean | null
          joined_at: string | null
          role: Database["public"]["Enums"]["game_role"] | null
          room_id: string | null
          seat_number: number
          status: Database["public"]["Enums"]["player_status"] | null
          user_name: string
        }
        Insert: {
          id?: string
          is_ready?: boolean | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["game_role"] | null
          room_id?: string | null
          seat_number: number
          status?: Database["public"]["Enums"]["player_status"] | null
          user_name: string
        }
        Update: {
          id?: string
          is_ready?: boolean | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["game_role"] | null
          room_id?: string | null
          seat_number?: number
          status?: Database["public"]["Enums"]["player_status"] | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string | null
          creator_id: string
          current_players: number | null
          id: string
          max_players: number
          name: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          creator_id: string
          current_players?: number | null
          id?: string
          max_players: number
          name: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          creator_id?: string
          current_players?: number | null
          id?: string
          max_players?: number
          name?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string | null
          id: string
          room_id: string | null
          round_number: number
          target_id: string | null
          voter_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          room_id?: string | null
          round_number: number
          target_id?: string | null
          voter_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          room_id?: string | null
          round_number?: number
          target_id?: string | null
          voter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "votes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      game_phase: "lobby" | "night" | "day" | "ended"
      game_role: "mafia" | "doctor" | "police" | "citizen"
      player_status: "alive" | "dead" | "spectator"
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
      game_phase: ["lobby", "night", "day", "ended"],
      game_role: ["mafia", "doctor", "police", "citizen"],
      player_status: ["alive", "dead", "spectator"],
    },
  },
} as const
