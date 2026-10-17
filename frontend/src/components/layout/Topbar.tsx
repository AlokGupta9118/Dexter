import { RefreshCw, ShieldCheck } from "lucide-react";
import type { Page } from "../../types/workspace";
import { navItems } from "../../config/workspace";
export function Topbar({ page, busy, onRefresh }: { page: Page; busy: boolean; onRefresh: () => void }) {
  const currentPage = navItems.find((item) => item.id === page);
  return <header className="topbar"><span className="breadcrumb">Workspace / {currentPage?.label || "Overview"}</span><div className="topbar-actions"><span className="secure-label"><ShieldCheck size={15} /> Private workspace</span><button className="icon-button" title="Refresh workspace data" disabled={busy} onClick={onRefresh}><RefreshCw size={17} /></button></div></header>;
}
