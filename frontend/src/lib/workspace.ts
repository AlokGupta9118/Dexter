import type { Conversation } from "../types/workspace";

export function errorMessage(error: unknown): string {
  const e = error as any;

  if (e?.code === "auth/invalid-credential") {
    return "Incorrect email or password.";
  }

  if (e?.code === "auth/email-already-in-use") {
    return "An account already exists with this email.";
  }

  if (e?.code === "auth/weak-password") {
    return "Choose a stronger password.";
  }

  if (e?.code === "auth/network-request-failed") {
    return "Network error. Check your internet connection.";
  }

  return e?.message || "Something went wrong. Please try again.";
}

export function formatDate(value: any): string {
  if (!value) return "Recently";

  const date =
    typeof value === "object" && value?.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value);

  return Number.isNaN(date.getTime())
    ? "Recently"
    : date.toLocaleString();
}

export function readItems<T>(data: any, key: string): T[] {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

/** Normalize older and newer backend conversation shapes before rendering. */
export function normalizeConversations(data: any): Conversation[] {
  return readItems<any>(data, "items")
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const id = String(item.id ?? item.conversation_id ?? "").trim();
      return {
        id,
        name: String(item.name ?? item.title ?? "").trim() || `Conversation ${id.slice(0, 8) || "new"}`,
        updated_at: item.updated_at ?? item.created_at ?? null,
        last_mode: String(item.last_mode ?? item.last_agent ?? item.mode ?? "general"),
      };
    })
    .filter((item) => Boolean(item.id));
}

