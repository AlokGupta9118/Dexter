import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import type { User } from "firebase/auth";
import { AlertTriangle, CheckCircle2, Sparkles, X } from "lucide-react";
import { auth, firebaseConfigured, missingFirebaseConfig } from "./firebase";
import { AuthScreen } from "./components/AuthScreen";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { WorkspacePages } from "./components/pages/WorkspacePages";
import { MySpace } from "./components/pages/MySpace";
import "./my-space.css";
import { modes } from "./config/workspace";
import { errorMessage, normalizeConversations, readItems } from "./lib/workspace";
import type { Action, Conversation, Json, Memory, Message, Mode, Page } from "./types/workspace";

const API = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [page, setPage] = useState<Page>("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState<Json>({});
  const [profileName, setProfileName] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [goalsText, setGoalsText] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<Mode>("auto");
  const [draft, setDraft] = useState("");

  const [memoryText, setMemoryText] = useState("");
  const [memoryCategory, setMemoryCategory] = useState("preference");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [memorySearch, setMemorySearch] = useState("");

  const [actionKind, setActionKind] = useState("reminder");
  const [actionTitle, setActionTitle] = useState("");
  const [actionDetails, setActionDetails] = useState("");
  const [actionDate, setActionDate] = useState("");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);
      },
      (authError) => {
        setError(errorMessage(authError));
        setAuthReady(true);
      }
    );

    return unsubscribe;
  }, []);

  const api = useCallback(async <T,>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> => {
    const currentUser = auth?.currentUser;

    if (!currentUser) {
      throw new Error("Please sign in to continue.");
    }

    const token = await currentUser.getIdToken();

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;

    try {
      response = await fetch(`${API}${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new Error(
        `Cannot reach the backend at ${API}. Check that it is running and CORS allows your frontend origin.`
      );
    }

    const text = await response.text();
    let data: any = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { detail: text };
      }
    }

    if (response.status === 401) {
      try {
        await currentUser.getIdToken(true);
      } catch {
        // The user must sign in again if refreshing the token fails.
      }

      throw new Error(
        "The backend rejected your session. Please sign in again."
      );
    }

    if (!response.ok) {
      const detail = data?.detail;

      const message = Array.isArray(detail)
        ? detail.map((item: any) => item.msg || "Invalid request").join(", ")
        : typeof detail === "string"
          ? detail
          : `Request failed (${response.status})`;

      throw new Error(message);
    }

    return data as T;
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;

    setError("");

    const results = await Promise.allSettled([
      api<any>("/v1/me"),
      api<any>("/v1/conversations"),
      api<any>("/v1/memories"),
      api<any>("/v1/agents"),
    ]);

    const [me, conv, mem, act, agentResult] = results;

    if (me.status === "fulfilled") {
      const p = me.value.profile || {};
      setProfile(p);
      setProfileName(p.display_name || user.displayName || "");
      setTimezone(
        p.timezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          "UTC"
      );
      setGoalsText(Array.isArray(p.goals) ? p.goals.join("\n") : "");
    }

    if (conv.status === "fulfilled") {
      setConversations(normalizeConversations(conv.value));
    }

    if (mem.status === "fulfilled") {
      setMemories(readItems<Memory>(mem.value, "items"));
    }

    if (act.status === "fulfilled") {
      setActions(readItems<Action>(act.value, "items"));
    }

    if (agentResult.status === "fulfilled") {
      setAgents(readItems<any>(agentResult.value, "agents"));
    }

    const failures = results
      .filter((result) => result.status === "rejected")
      .length;

    if (failures > 0) {
      setError(
        `${failures} workspace endpoint(s) failed to load. Check the backend routes and server logs.`
      );
    }
  }, [api, user]);

  useEffect(() => {
    if (user) {
      void refresh();
    } else {
      setProfile({});
      setConversations([]);
      setMemories([]);
      setActions([]);
      setAgents([]);
      setMessages([]);
      setActiveConversation(null);
    }
  }, [user, refresh]);

  const loadConversation = useCallback(async (id: string) => {
    setBusy(true);
    setError("");

    try {
      const data = await api<any>(
        `/v1/conversations/${encodeURIComponent(id)}/messages`
      );

      const loaded = readItems<any>(data, "items")
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({
          id: item.id,
          role: item.role,
          content: item.content || "",
          mode: item.mode,
        })) as Message[];

      setActiveConversation(id);
      setMessages(loaded);
      setPage("chat");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [api]);

  const newChat = () => {
    setActiveConversation(null);
    setMessages([]);
    setDraft("");
    setError("");
    setNotice("");
    setPage("chat");
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();

    const message = draft.trim();

    if (!message || busy) return;

    setError("");
    setNotice("");
    setBusy(true);
    setDraft("");
    setPage("chat");

    const optimistic: Message = {
      role: "user",
      content: message,
      mode,
    };

    setMessages((previous) => [...previous, optimistic]);

    try {
      const result = await api<any>("/v1/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          conversation_id: activeConversation,
          mode,
        }),
      });

      if (!result?.answer || !result?.conversation_id) {
        throw new Error(
          "The chat response is missing answer or conversation_id. Check the backend response schema."
        );
      }

      setActiveConversation(result.conversation_id);
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: result.answer,
          mode: result.mode || mode,
        },
      ]);

      setNotice(
        `Answered by ${result.mode || "Dexter"} · ${
          result.memory_count ?? 0
        } memories in context`
      );

      const conv = await api<any>("/v1/conversations");
      setConversations(normalizeConversations(conv));
    } catch (e) {
      setError(errorMessage(e));
      // Keep the user's message visible so they can retry or copy it.
    } finally {
      setBusy(false);
    }
  };

  const saveMemory = async (event: FormEvent) => {
    event.preventDefault();

    const text = memoryText.trim();
    if (!text || busy) return;

    setBusy(true);
    setError("");

    try {
      if (editingMemory) {
        await api(`/v1/memories/${encodeURIComponent(editingMemory.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            text,
            category: memoryCategory,
          }),
        });

        setNotice("Memory updated.");
      } else {
        await api("/v1/memories", {
          method: "POST",
          body: JSON.stringify({
            text,
            category: memoryCategory,
            consented: true,
          }),
        });

        setNotice("Memory saved with your consent.");
      }

      setMemoryText("");
      setEditingMemory(null);

      const data = await api<any>("/v1/memories");
      setMemories(readItems<Memory>(data, "items"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteMemory = async (memory: Memory) => {
    if (!window.confirm("Delete this saved memory?")) return;

    setBusy(true);
    setError("");

    try {
      await api(`/v1/memories/${encodeURIComponent(memory.id)}`, {
        method: "DELETE",
      });

      setMemories((previous) =>
        previous.filter((item) => item.id !== memory.id)
      );

      if (editingMemory?.id === memory.id) {
        setEditingMemory(null);
        setMemoryText("");
      }

      setNotice("Memory deleted.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      await api("/v1/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: profileName.trim(),
          timezone: timezone.trim(),
          goals: goalsText
            .split("\n")
            .map((goal) => goal.trim())
            .filter(Boolean),
        }),
      });

      if (auth?.currentUser && profileName.trim()) {
        await updateProfile(auth.currentUser, {
          displayName: profileName.trim(),
        });
      }

      setNotice("Profile saved.");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const createAction = async (event: FormEvent) => {
    event.preventDefault();

    if (!actionTitle.trim() || busy) return;

    let details: Json = {};

    if (actionDetails.trim()) {
      try {
        details = JSON.parse(actionDetails);
      } catch {
        details = { notes: actionDetails.trim() };
      }
    }

    setBusy(true);
    setError("");

    try {
      await api("/v1/actions", {
        method: "POST",
        body: JSON.stringify({
          kind: actionKind,
          title: actionTitle.trim(),
          details,
          scheduled_at: actionDate
            ? new Date(actionDate).toISOString()
            : null,
        }),
      });

      setActionTitle("");
      setActionDetails("");
      setActionDate("");

      const data = await api<any>("/v1/actions");
      setActions(readItems<Action>(data, "items"));
      setNotice("Action submitted for review. Nothing was executed.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const decideAction = async (action: Action, approved: boolean) => {
    if (busy) return;

    const decision = approved ? "approve" : "reject";

    if (
      !window.confirm(
        approved
          ? `Approve "${action.title}"? This records approval; it does not guarantee execution.`
          : `Reject "${action.title}"?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await api<any>(
        `/v1/actions/${encodeURIComponent(action.id)}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            approved,
            note: decisionNotes[action.id] || "",
          }),
        }
      );

      setActions((previous) =>
        previous.map((item) =>
          item.id === action.id
            ? {
                ...item,
                state: result.state || (approved ? "approved" : "rejected"),
                decision_note: decisionNotes[action.id] || "",
              }
            : item
        )
      );

      setNotice(
        result.message ||
          `Decision recorded: ${decision}. External execution is separate.`
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm("Delete this conversation and its messages?")) return;

    setBusy(true);
    setError("");

    try {
      await api(`/v1/conversations/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== id)
      );

      if (activeConversation === id) {
        setActiveConversation(null);
        setMessages([]);
      }

      setNotice("Conversation deleted.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const filteredMemories = useMemo(
    () =>
      memories.filter((memory) =>
        `${memory.text} ${memory.category}`
          .toLowerCase()
          .includes(memorySearch.toLowerCase())
      ),
    [memories, memorySearch]
  );

  const pendingCount = actions.filter(
    (action) => action?.state === "pending_approval"
  ).length;

  const displayName =
    profile.display_name ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "there";

  if (!authReady) {
    return (
      <main className="center-screen">
        <Sparkles />
        <p>Preparing your workspace…</p>
      </main>
    );
  }

  if (!firebaseConfigured || !auth) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <Sparkles size={28} />
          <h1>Configure Firebase</h1>
          <p>Add the missing Firebase web configuration values to your frontend .env file.</p>
          <ul>
            {missingFirebaseConfig.map((key) => (
              <li key={key}><code>{key}</code></li>
            ))}
          </ul>
          <p>Restart the Vite development server after saving .env.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={(nextPage) => { setPage(nextPage); setError(""); }} pendingCount={pendingCount} displayName={displayName} user={user} newChat={newChat} onSignOut={() => void signOut(auth!)} />
      <main className="main-area">
        <Topbar page={page} busy={busy} onRefresh={() => void refresh()} />
        <div className="page-content">
          {error && <div className="alert error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
          {notice && <div className="alert success" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={15} /></button></div>}
          {busy && <div className="busy-line"><span /></div>}
          {page === "my-space" ? (
            <MySpace api={api} displayName={displayName} />
          ) : (
            <WorkspacePages page={page} displayName={displayName} conversations={conversations} memories={memories} pendingCount={pendingCount} agents={agents} setMode={setMode} newChat={newChat} setPage={setPage} loadConversation={loadConversation} mode={mode} messages={messages} busy={busy} draft={draft} setDraft={setDraft} sendMessage={sendMessage} deleteConversation={deleteConversation} memoryText={memoryText} setMemoryText={setMemoryText} memoryCategory={memoryCategory} setMemoryCategory={setMemoryCategory} editingMemory={editingMemory} saveMemory={saveMemory} setEditingMemory={setEditingMemory} memorySearch={memorySearch} setMemorySearch={setMemorySearch} filteredMemories={filteredMemories} deleteMemory={deleteMemory} actionKind={actionKind} setActionKind={setActionKind} actionTitle={actionTitle} setActionTitle={setActionTitle} actionDate={actionDate} setActionDate={setActionDate} actionDetails={actionDetails} setActionDetails={setActionDetails} createAction={createAction} actions={actions} decisionNotes={decisionNotes} setDecisionNotes={setDecisionNotes} decideAction={decideAction} profileName={profileName} setProfileName={setProfileName} user={user} timezone={timezone} setTimezone={setTimezone} goalsText={goalsText} setGoalsText={setGoalsText} saveProfile={saveProfile} />
          )}
        </div>
      </main>
    </div>
  );
}
