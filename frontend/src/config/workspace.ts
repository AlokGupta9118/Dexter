import type { Mode } from "../types/workspace";
import { Activity, BookOpen, Bot, Brain, CalendarClock, Clock, Code2, MessageSquare, Plane, Search, Settings, ShieldCheck, Sparkles, UserRound } from "lucide-react";

export const modes: {
  id: Mode;
  label: string;
  description: string;
  icon: any;
}[] = [
  { id: "auto", label: "Auto", description: "Choose the best agent", icon: Sparkles },
  { id: "general", label: "General", description: "Everyday assistance", icon: Bot },
  { id: "tutor", label: "Tutor", description: "Learn step by step", icon: BookOpen },
  { id: "researcher", label: "Researcher", description: "Evidence-led research", icon: Search },
  { id: "builder", label: "Builder", description: "Coding and debugging", icon: Code2 },
  { id: "travel", label: "Travel", description: "Trip planning", icon: Plane },
  { id: "personal", label: "Personal", description: "Goals and routines", icon: UserRound },
];

export const categories = [
  "preference",
  "goal",
  "habit",
  "context",
  "relationship",
  "episodic",
  "other",
];

export const navItems = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "my-space", label: "My Space", icon: CalendarClock },
  { id: "chat", label: "AI workspace", icon: MessageSquare },
  { id: "conversations", label: "Conversations", icon: Clock },
  { id: "memories", label: "Long-term memory", icon: Brain },
  { id: "actions", label: "Approval center", icon: ShieldCheck },
  { id: "profile", label: "Profile & settings", icon: Settings },
] as const;


