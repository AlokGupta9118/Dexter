export type Mode =
  | "auto"
  | "general"
  | "tutor"
  | "researcher"
  | "builder"
  | "travel"
  | "personal";

export type Json = Record<string, any>;

export type Message = { id?: string; role: "user" | "assistant"; content: string; mode?: string };
export type Conversation = { name: string; id: string; updated_at?: any; last_mode?: string };
export type Memory = { id: string; text: string; category: string; created_at?: any; updated_at?: any };
export type Action = { id: string; kind: string; title: string; details?: Json; scheduled_at?: string; created_at?: any; state: string; decision_note?: string };
export type Page = "overview" | "chat" | "conversations" | "memories" | "actions" | "profile" | "my-space";
