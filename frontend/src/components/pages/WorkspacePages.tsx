import { LogOut, MessageSquare, Plus, Send, ShieldCheck, Sparkles, Trash2, UserRound } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { modes, categories } from "../../config/workspace";
import { formatDate } from "../../lib/workspace";
import type { Conversation, Memory, Message, Mode, Page } from "../../types/workspace";
import { StatCard } from "../ui/StatCard";
import { ThemeToggle } from "../ui/ThemeToggle";
type Props = {
  page: Page; displayName: string; conversations: Conversation[]; memories: Memory[]; agents: any[];
  setMode: (mode: Mode) => void; newChat: () => void; setPage: (page: Page) => void; loadConversation: (id: string) => void;
  mode: Mode; messages: Message[]; busy: boolean; draft: string; setDraft: (value: string) => void; sendMessage: (event?: any) => void;
  deleteConversation: (id: string) => void; memoryText: string; setMemoryText: (value: string) => void; memoryCategory: string; setMemoryCategory: (value: string) => void;
  editingMemory: Memory | null; saveMemory: (event: any) => void; setEditingMemory: (value: Memory | null) => void; memorySearch: string; setMemorySearch: (value: string) => void;
  filteredMemories: Memory[]; deleteMemory: (memory: Memory) => void; profileName: string; setProfileName: (value: string) => void;
  user: any; timezone: string; setTimezone: (value: string) => void; goalsText: string; setGoalsText: (value: string) => void; saveProfile: (event: any) => void;
};

export function WorkspacePages(p: Props) {
  const { page, displayName, conversations, memories, agents, setMode, newChat, setPage, loadConversation, mode, messages, busy, draft, setDraft, sendMessage, deleteConversation, memoryText, setMemoryText, memoryCategory, setMemoryCategory, editingMemory, saveMemory, setEditingMemory, memorySearch, setMemorySearch, filteredMemories, deleteMemory, profileName, setProfileName, user, timezone, setTimezone, goalsText, setGoalsText, saveProfile } = p;
  return (
    <>
      <div className="theme-toggle-row"><ThemeToggle /></div>
          {page === "overview" && (
            <section>
              <div className="eyebrow">YOUR PERSONAL AI WORKSPACE</div>
              <h1>Good to see you, {displayName.split(" ")[0]}.</h1>
              <p className="subhead">
                Learn, build, research, plan, and keep your context in one workspace.
              </p>

              <div className="stat-grid">
                <StatCard label="Conversations" value={conversations.length} />
                <StatCard label="Tell Us About You" value={memories.length} />
                <StatCard label="Agents reported" value={agents.length} />
              </div>

              <div className="section-heading">
                <h2>Your agent team</h2>
                <button className="text-button" onClick={newChat}>Open workspace →</button>
              </div>

              <div className="agent-grid">
                {modes.map((item) => (
                  <button
                    className="agent-card"
                    key={item.id}
                    onClick={() => {
                      setMode(item.id);
                      newChat();
                    }}
                  >
                    <item.icon size={21} />
                    <b>{item.label}</b>
                    <p>{item.description}</p>
                  </button>
                ))}
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <h3>Recent conversations</h3>
                  <button className="text-button" onClick={() => setPage("conversations")}>
                    View all
                  </button>
                </div>
                {conversations.slice(0, 5).map((conversation) => (
                  <div className="list-row" key={conversation.id}>
                    <MessageSquare size={17} />
                    <div className="row-main">
                      <b>{(conversation.name || `Conversation ${String(conversation.name || "").slice(0, 25)}`).slice(0, 60)}</b>
                      <span>{conversation.last_mode || "general"} · {formatDate(conversation.updated_at)}</span>
                    </div>
                    <button className="text-button" onClick={() => void loadConversation(conversation.id)}>
                      Open
                    </button>
                  </div>
                ))}
                {conversations.length === 0 && <p>No conversations yet.</p>}
              </div>
            </section>
          )}

          {page === "chat" && (
            <section className="chat-page">
              <div className="chat-title-row">
                <div>
                  <div className="eyebrow"><Sparkles size={14} /> Dexter AI WORKSPACE</div>
                  <h1>What are we working on?</h1>
                  <p className="subhead">
                    Switch specialists while keeping the same conversation.
                  </p>
                </div>
                <button className="secondary-button" onClick={newChat}>
                  <Plus size={16} /> New chat
                </button>
              </div>

              <div className="mode-strip">
                {modes.map((item) => (
                  <button
                    key={item.id}
                    className={`mode-chip ${mode === item.id ? "selected" : ""}`}
                    onClick={() => setMode(item.id)}
                  >
                    <item.icon size={15} /> {item.label}
                  </button>
                ))}
              </div>

              <div className="chat-surface">
                <div className="message-list">
                  {messages.length === 0 && (
                    <div className="chat-empty">
                      <Sparkles size={28} />
                      <h2>How can Dexter help?</h2>
                      <p>Ask a question, work on code, learn a concept, or plan a trip.</p>
                    </div>
                  )}

                  {messages.map((message, index) => (
                    <div
                      key={message.id || `${index}-${message.role}`}
                      className={`message ${message.role}`}
                    >
                      <div className="message-avatar">
                        {message.role === "assistant" ? <Sparkles size={16} /> : <UserRound size={16} />}
                      </div>
                      <div className="message-body">
                        <div className="message-meta">
                          {message.role === "assistant" ? "Dexter" : "You"}
                          {message.mode && <span className="tiny-tag">{message.mode}</span>}
                        </div>
                        <div className="message-text">{message.content}</div>
                      </div>
                    </div>
                  ))}

                  {busy && <p className="typing">Dexter is thinking…</p>}
                </div>

                <form className="composer" onSubmit={sendMessage}>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder="Message Dexter… (Enter to send, Shift + Enter for a new line)"
                    rows={3}
                    maxLength={20000}
                    disabled={busy}
                  />
                  <div className="composer-footer">
                    <span><ShieldCheck size={14} /> Authenticated workspace</span>
                    <button className="send-button" disabled={!draft.trim() || busy}>
                      <Send size={17} /> Send
                    </button>
                  </div>
                </form>
              </div>

              <p className="fine-print">
              </p>
            </section>
          )}

          {page === "conversations" && (
            <section>
              <div className="page-heading">
                <h1>Conversations</h1>
                <button className="primary-button" onClick={newChat}>
                  <Plus size={16} /> New chat
                </button>
              </div>

              <div className="panel">
                {conversations.map((conversation) => (
                  <div className="conversation-row" key={conversation.id}>
                    <MessageSquare size={18} />
                    <div className="row-main">
                      <b>Conversation {String(conversation.name || "").slice(0, 25)}</b>
                      <span>
                        {conversation.last_mode || "general"} · {formatDate(conversation.updated_at)}
                      </span>
                    </div>
                    <button className="secondary-button" onClick={() => void loadConversation(conversation.id)}>
                      Open
                    </button>
                    <button
                      className="icon-button"
                      title="Delete conversation"
                      onClick={() => void deleteConversation(conversation.id)}
                      disabled={busy}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {conversations.length === 0 && <p>No conversations saved yet.</p>}
              </div>
            </section>
          )}

          {page === "memories" && (
            <section>
              <h1>Tell Us About You</h1>
              <p className="subhead">
                Memories are saved to your account after you explicitly consent.
              </p>

              <div className="two-column">
                <form className="panel form-panel" onSubmit={saveMemory}>
                  <h3>{editingMemory ? "Edit memory" : "Add a memory"}</h3>
                  <label htmlFor="memory-text">Memory</label>
                  <textarea
                    id="memory-text"
                    required
                    maxLength={2000}
                    rows={5}
                    value={memoryText}
                    onChange={(event) => setMemoryText(event.target.value)}
                  />

                  <label htmlFor="memory-category">Category</label>
                  <select
                    id="memory-category"
                    value={memoryCategory}
                    onChange={(event) => setMemoryCategory(event.target.value)}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>

                  <p className="consent-note">
                    By saving, you consent to storing this memory and using it as context.
                  </p>

                  <button className="primary-button" disabled={busy || !memoryText.trim()}>
                    {editingMemory ? "Save changes" : "Save memory"}
                  </button>

                  {editingMemory && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingMemory(null);
                        setMemoryText("");
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </form>

                <div className="panel">
                  <div className="panel-heading">
                    <h3>Saved context ({memories.length})</h3>
                    <input
                      aria-label="Search memories"
                      placeholder="Search memories"
                      value={memorySearch}
                      onChange={(event) => setMemorySearch(event.target.value)}
                    />
                  </div>

                  {filteredMemories.map((memory) => (
                    <div className="memory-item" key={memory.id}>
                      <div className="memory-item-top">
                        <span className="category-tag">{memory.category}</span>
                        <span>{formatDate(memory.updated_at || memory.created_at)}</span>
                      </div>
                      <p>{memory.text}</p>
                      <div className="item-actions">
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditingMemory(memory);
                            setMemoryText(memory.text);
                            setMemoryCategory(memory.category);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button danger-text"
                          onClick={() => void deleteMemory(memory)}
                          disabled={busy}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  ))}

                  {filteredMemories.length === 0 && <p>No matching memories found.</p>}
                </div>
              </div>
            </section>
          )}


          {page === "profile" && (
            <section>
              <h1>Profile & settings</h1>
              <p className="subhead">Manage your workspace preferences.</p>

              <form className="panel form-panel" onSubmit={saveProfile}>
                <label htmlFor="display-name">Display name</label>
                <input
                  id="display-name"
                  maxLength={120}
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                />

                <label>Email</label>
                <input value={user.email || ""} readOnly />

                <label htmlFor="timezone">Timezone</label>
                <input
                  id="timezone"
                  maxLength={80}
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                />

                <label htmlFor="goals">Goals (one per line)</label>
                <textarea
                  id="goals"
                  rows={5}
                  value={goalsText}
                  onChange={(event) => setGoalsText(event.target.value)}
                />

                <button className="primary-button" disabled={busy}>
                  Save profile
                </button>
              </form>

              <div className="panel security-panel">
                <h3><ShieldCheck size={18} /> Privacy and safety</h3>
                <p>API requests are authenticated using Firebase ID tokens.</p>
                <p>Memories require consent when created.</p>
                <button className="secondary-button" onClick={() => { if (auth) void signOut(auth); }}>
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </section>
          )}
    </>
  );
}