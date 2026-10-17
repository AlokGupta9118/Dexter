import { LogOut, Plus, Sparkles } from "lucide-react";
import { navItems } from "../../config/workspace";
import type { Page } from "../../types/workspace";
import type { User } from "firebase/auth";

type Props = { page: Page; setPage: (page: Page) => void; pendingCount: number; displayName: string; user: User; newChat: () => void; onSignOut: () => void };
export function Sidebar({ page, setPage, pendingCount, displayName, user, newChat, onSignOut }: Props) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><Sparkles size={20} /></div><div><strong>DEXTER</strong><span>PERSONAL AI</span></div></div>
    <button className="new-chat-button" onClick={newChat}><Plus size={17} /> New conversation</button>
    <nav className="nav-group">{navItems.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === "actions" && pendingCount > 0 && <b className="nav-count">{pendingCount}</b>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(displayName || "N").charAt(0).toUpperCase()}</div><div className="user-mini-text"><b>{displayName}</b><span>{user.email}</span></div><button className="icon-button" title="Sign out" onClick={onSignOut}><LogOut size={17} /></button></div></div>
  </aside>;
}
