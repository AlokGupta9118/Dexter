import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Activity, AlarmClock, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronRight, Circle, Clock3, Flame, Flag, Heart, Plus, RefreshCw, Sparkles, Target, TrendingUp, X } from "lucide-react";

type AnyRecord = Record<string, any>;
type Api = <T = any>(path: string, init?: RequestInit) => Promise<T>;
type Props = { api: Api; displayName: string };

const safeItems = (data: any) => Array.isArray(data?.items) ? data.items : [];
const prettyDate = (value: any) => {
  if (!value) return "No date set";
  const date = new Date(value?.seconds ? value.seconds * 1000 : value);
  return Number.isNaN(date.getTime()) ? "No date set" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const dateInput = () => { const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); };

export function MySpace({ api, displayName }: Props) {
  const [brief, setBrief] = useState<AnyRecord>({});
  const [goals, setGoals] = useState<AnyRecord[]>([]);
  const [reminders, setReminders] = useState<AnyRecord[]>([]);
  const [habits, setHabits] = useState<AnyRecord[]>([]);
  const [activity, setActivity] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"goal" | "reminder" | "habit" | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalPriority, setGoalPriority] = useState("medium");
  const [goalDate, setGoalDate] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [reminderDate, setReminderDate] = useState(dateInput());
  const [recurrence, setRecurrence] = useState("none");
  const [habitName, setHabitName] = useState("");
  const [habitFrequency, setHabitFrequency] = useState("daily");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      api<AnyRecord>("/v1/personal/daily-brief"),
      api<AnyRecord>("/v1/personal/goals"),
      api<AnyRecord>("/v1/personal/reminders"),
      api<AnyRecord>("/v1/personal/habits"),
      api<AnyRecord>("/v1/personal/activity?limit=12"),
    ]);
    if (results[0].status === "fulfilled") setBrief(results[0].value || {});
    if (results[1].status === "fulfilled") setGoals(safeItems(results[1].value));
    if (results[2].status === "fulfilled") setReminders(safeItems(results[2].value));
    if (results[3].status === "fulfilled") setHabits(safeItems(results[3].value));
    if (results[4].status === "fulfilled") setActivity(safeItems(results[4].value));
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed) setError(`${failed} My Space endpoint(s) failed. Check that the personal-agent router is mounted and the backend is running.`);
    setLoading(false); setRefreshing(false);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const activeGoals = useMemo(() => goals.filter(g => (g.status || "active") === "active"), [goals]);
  const activeReminders = useMemo(() => reminders.filter(r => (r.status || "active") === "active"), [reminders]);
  const activeHabits = useMemo(() => habits.filter(h => h.active !== false), [habits]);
  const overdue = useMemo(() => activeReminders.filter(r => r.due_at && new Date(r.due_at?.seconds ? r.due_at.seconds * 1000 : r.due_at).getTime() < Date.now()), [activeReminders]);
  const upcoming = useMemo(() => activeReminders.filter(r => !r.due_at || new Date(r.due_at?.seconds ? r.due_at.seconds * 1000 : r.due_at).getTime() >= Date.now()).sort((a,b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()).slice(0,5), [activeReminders]);

  const create = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      if (modal === "goal") {
        await api("/v1/personal/goals", { method: "POST", body: JSON.stringify({ title: goalTitle.trim(), description: goalDescription.trim(), priority: goalPriority, target_date: goalDate || null, category: "personal" }) });
        setNotice("Goal added to your space."); setGoalTitle(""); setGoalDescription(""); setGoalDate("");
      } else if (modal === "reminder") {
        await api("/v1/personal/reminders", { method: "POST", body: JSON.stringify({ title: reminderTitle.trim(), note: reminderNote.trim(), due_at: new Date(reminderDate).toISOString(), timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", recurrence, category: "personal", notification_channel: "in_app" }) });
        setNotice("Reminder saved. Notification delivery still depends on a configured scheduler or notification service."); setReminderTitle(""); setReminderNote(""); setReminderDate(dateInput()); setRecurrence("none");
      } else if (modal === "habit") {
        await api("/v1/personal/habits", { method: "POST", body: JSON.stringify({ name: habitName.trim(), frequency: habitFrequency, description: "", target_count: 1, consented: true }) });
        setNotice("Habit created. You can check in whenever you complete it."); setHabitName("");
      }
      setModal(null); await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this item."); }
    finally { setSaving(false); }
  };

  const completeReminder = async (id: string) => {
    setError(""); setNotice("");
    try { await api(`/v1/personal/reminders/${encodeURIComponent(id)}/complete`, { method: "POST" }); setNotice("Reminder marked complete."); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update reminder."); }
  };
  const checkIn = async (habit: AnyRecord) => {
    setError(""); setNotice("");
    try { await api(`/v1/personal/habits/${encodeURIComponent(habit.id)}/check-in`, { method: "POST", body: JSON.stringify({ completed: true, note: "Checked in from My Space" }) }); setNotice(`${habit.name} check-in saved.`); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save habit check-in."); }
  };
  const finishGoal = async (goal: AnyRecord) => {
    try { await api(`/v1/personal/goals/${encodeURIComponent(goal.id)}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) }); setNotice(`“${goal.title}” marked complete.`); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update goal."); }
  };

  const firstName = (displayName || "there").trim().split(/\s+/)[0] || "there";
  const dateLabel = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return <section className="myspace-page">
    <div className="theme-toggle-row"><ThemeToggle /></div>
    <div className="myspace-hero">
      <div className="myspace-hero-glow" />
      <div className="myspace-hero-copy">
        <div className="myspace-eyebrow"><Sparkles size={14} /> YOUR PERSONAL COMMAND CENTER <span className="myspace-live"><i /> YOUR SPACE</span></div>
        <h1>Your life, <span>in sync.</span></h1>
        <p>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {firstName}. A calmer view of what matters, what’s next, and how far you’ve come.</p>
        <div className="myspace-hero-meta"><span><CalendarDays size={15} /> {dateLabel}</span><span><Sparkles size={15} /> Powered by your Personal Agent</span></div>
      </div>
      <div className="myspace-orbit" aria-hidden="true"><div className="orbit-ring orbit-ring-one"/><div className="orbit-ring orbit-ring-two"/><div className="orbit-core"><Sparkles size={31}/></div><span className="orbit-node node-a"><Target size={15}/></span><span className="orbit-node node-b"><AlarmClock size={15}/></span><span className="orbit-node node-c"><Heart size={15}/></span></div>
    </div>

    {error && <div className="myspace-alert is-error"><AlertTriangleIcon /> <span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={15}/></button></div>}
    {notice && <div className="myspace-alert is-success"><CheckCircle2 size={16}/> <span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}

    <div className="myspace-toolbar"><div><h2>Your overview</h2><p>A live snapshot of the things you’re tracking.</p></div><button className="myspace-ghost-button" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "spin" : ""}/> {refreshing ? "Refreshing" : "Refresh data"}</button></div>

    <div className="myspace-stat-grid">
      <article className="myspace-stat-card stat-violet"><div className="myspace-stat-top"><span>Active goals</span><span className="myspace-stat-icon"><Target size={18}/></span></div><strong>{loading ? "—" : activeGoals.length}</strong><div className="myspace-stat-bottom"><span className="stat-dot"/> Keep moving forward</div><div className="myspace-stat-spark"><TrendingUp size={50}/></div></article>
      <article className="myspace-stat-card stat-blue"><div className="myspace-stat-top"><span>Upcoming reminders</span><span className="myspace-stat-icon"><AlarmClock size={18}/></span></div><strong>{loading ? "—" : activeReminders.length}</strong><div className="myspace-stat-bottom"><span className="stat-dot"/> {overdue.length ? `${overdue.length} need attention` : "Stay ahead of your day"}</div><div className="myspace-stat-spark"><Clock3 size={50}/></div></article>
      <article className="myspace-stat-card stat-green"><div className="myspace-stat-top"><span>Active habits</span><span className="myspace-stat-icon"><Flame size={18}/></span></div><strong>{loading ? "—" : activeHabits.length}</strong><div className="myspace-stat-bottom"><span className="stat-dot"/> Small wins compound</div><div className="myspace-stat-spark"><Activity size={50}/></div></article>
      <article className="myspace-stat-card stat-amber"><div className="myspace-stat-top"><span>Activity records</span><span className="myspace-stat-icon"><TrendingUp size={18}/></span></div><strong>{loading ? "—" : activity.length}</strong><div className="myspace-stat-bottom"><span className="stat-dot"/> Your progress, captured</div><div className="myspace-stat-spark"><Sparkles size={50}/></div></article>
    </div>

    <div className="myspace-quick-actions"><button onClick={() => setModal("goal")}><span className="quick-icon quick-purple"><Target size={18}/></span><span><b>Set a goal</b><small>Make progress intentional</small></span><Plus size={16}/></button><button onClick={() => setModal("reminder")}><span className="quick-icon quick-blue"><AlarmClock size={18}/></span><span><b>Create reminder</b><small>Keep the important things close</small></span><Plus size={16}/></button><button onClick={() => setModal("habit")}><span className="quick-icon quick-green"><Flame size={18}/></span><span><b>Build a habit</b><small>Turn intention into routine</small></span><Plus size={16}/></button></div>

    <div className="myspace-main-grid">
      <section className="myspace-panel myspace-reminders"><div className="myspace-panel-head"><div><span className="myspace-section-icon blue"><Clock3 size={17}/></span><div><h3>Coming up</h3><p>Your next commitments</p></div></div><span className="myspace-count">{upcoming.length}</span></div>
        {overdue.length > 0 && <div className="myspace-overdue-banner"><AlarmClock size={16}/><span><b>{overdue.length} overdue</b> — take a moment to review them.</span></div>}
        {loading ? <div className="myspace-skeleton-list"><i/><i/><i/></div> : upcoming.length ? upcoming.map((item) => <div className="myspace-reminder-row" key={item.id}><button className="myspace-check" title="Mark complete" onClick={() => void completeReminder(item.id)}><Check size={15}/></button><div className="myspace-row-content"><b>{item.title}</b><span>{prettyDate(item.due_at)} {item.recurrence && item.recurrence !== "none" ? `· ${item.recurrence}` : ""}</span>{item.note && <small>{item.note}</small>}</div><button className="myspace-row-arrow" onClick={() => void completeReminder(item.id)} aria-label="Complete reminder"><ChevronRight size={17}/></button></div>) : <div className="myspace-empty"><span><AlarmClock size={21}/></span><b>Nothing on the horizon</b><p>Add a reminder to give your future self a hand.</p><button onClick={() => setModal("reminder")}>Create reminder <Plus size={14}/></button></div>}
        <div className="myspace-panel-footer"><span>Reminders are stored in your account.</span><span className="myspace-foot-dot"/> <span>Delivery needs a scheduler integration.</span></div>
      </section>

      <section className="myspace-panel"><div className="myspace-panel-head"><div><span className="myspace-section-icon violet"><Flag size={17}/></span><div><h3>Goals in motion</h3><p>Keep your focus visible</p></div></div><button className="myspace-link-button" onClick={() => setModal("goal")}>Add goal <Plus size={14}/></button></div>
        {loading ? <div className="myspace-skeleton-list"><i/><i/><i/></div> : activeGoals.length ? activeGoals.slice(0,5).map((goal) => <div className="myspace-goal-row" key={goal.id}><button className="myspace-check goal-check" title="Mark goal complete" onClick={() => void finishGoal(goal)}><Check size={15}/></button><div className="myspace-row-content"><b>{goal.title}</b><span>{goal.description || "One step at a time."}</span><div className="myspace-goal-meta"><span className={`priority-${goal.priority || "medium"}`}>{goal.priority || "medium"} priority</span>{goal.target_date && <span><CalendarDays size={12}/> {prettyDate(goal.target_date)}</span>}</div></div></div>) : <div className="myspace-empty"><span><Target size={21}/></span><b>Give a goal some space</b><p>Start with one meaningful thing you want to move forward.</p><button onClick={() => setModal("goal")}>Create a goal <Plus size={14}/></button></div>}
      </section>

      <section className="myspace-panel"><div className="myspace-panel-head"><div><span className="myspace-section-icon green"><Flame size={17}/></span><div><h3>Daily habits</h3><p>Consistency over intensity</p></div></div><button className="myspace-link-button" onClick={() => setModal("habit")}>New habit <Plus size={14}/></button></div>
        {loading ? <div className="myspace-skeleton-list"><i/><i/></div> : activeHabits.length ? activeHabits.slice(0,5).map((habit) => <div className="myspace-habit-row" key={habit.id}><span className="habit-flame"><Flame size={17}/></span><div className="myspace-row-content"><b>{habit.name}</b><span>{habit.frequency === "weekly" ? "Weekly rhythm" : "Daily rhythm"}{habit.description ? ` · ${habit.description}` : ""}</span></div><button className="myspace-check habit-check" title="Check in" onClick={() => void checkIn(habit)}><Check size={15}/></button></div>) : <div className="myspace-empty"><span><Flame size={21}/></span><b>Build your own rhythm</b><p>A tiny repeatable habit can change a lot over time.</p><button onClick={() => setModal("habit")}>Add a habit <Plus size={14}/></button></div>}
      </section>

      <section className="myspace-panel"><div className="myspace-panel-head"><div><span className="myspace-section-icon amber"><Activity size={17}/></span><div><h3>Recent activity</h3><p>Your explicitly tracked moments</p></div></div><span className="myspace-count">{activity.length}</span></div>
        {loading ? <div className="myspace-skeleton-list"><i/><i/><i/></div> : activity.length ? <div className="myspace-timeline">{activity.slice(0,5).map((item, i) => <div className="myspace-timeline-row" key={item.id || i}><span className="timeline-dot"/><div><b>{item.summary || item.event_type || "Activity recorded"}</b><span>{item.event_type || "Personal activity"} · {prettyDate(item.created_at)}</span></div></div>)}</div> : <div className="myspace-empty compact"><span><Activity size={21}/></span><b>Your story starts here</b><p>Only activity you explicitly record will appear here.</p></div>}
      </section>
    </div>

    {brief?.suggested_focus?.length > 0 && <section className="myspace-focus-strip"><span className="focus-glow"><Sparkles size={19}/></span><div><b>A gentle nudge</b><p>Your personal agent suggests keeping these priorities in view: {brief.suggested_focus.slice(0,3).map((g: AnyRecord) => g.title).filter(Boolean).join(", ")}.</p></div><ArrowUpRight size={18}/></section>}

    {modal && <div className="myspace-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}><form className="myspace-modal" onSubmit={create}><div className="myspace-modal-head"><div><span className="myspace-section-icon violet">{modal === "goal" ? <Target size={18}/> : modal === "reminder" ? <AlarmClock size={18}/> : <Flame size={18}/>}</span><div><h3>{modal === "goal" ? "Create a goal" : modal === "reminder" ? "Create a reminder" : "Start a new habit"}</h3><p>{modal === "goal" ? "A clear direction for your next step." : modal === "reminder" ? "Give an important moment a place on your calendar." : "Keep it small enough to repeat."}</p></div></div><button type="button" className="myspace-modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={18}/></button></div>
      {modal === "goal" && <><label>Goal title<input autoFocus required maxLength={180} value={goalTitle} onChange={e => setGoalTitle(e.target.value)} placeholder="e.g. Finish my portfolio"/></label><label>Description<textarea rows={3} maxLength={2000} value={goalDescription} onChange={e => setGoalDescription(e.target.value)} placeholder="What does success look like?"/></label><div className="myspace-form-row"><label>Priority<select value={goalPriority} onChange={e => setGoalPriority(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Target date<input type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)}/></label></div></>}
      {modal === "reminder" && <><label>Reminder title<input autoFocus required maxLength={180} value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} placeholder="e.g. Submit assignment"/></label><label>When<input type="datetime-local" required value={reminderDate} onChange={e => setReminderDate(e.target.value)}/></label><label>Repeat<select value={recurrence} onChange={e => setRecurrence(e.target.value)}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Note (optional)<textarea rows={2} maxLength={2000} value={reminderNote} onChange={e => setReminderNote(e.target.value)} placeholder="Any details to remember?"/></label><p className="myspace-modal-note"><Circle size={12}/> Saving a reminder does not itself send a push, email, or SMS. A scheduler/notification integration is required.</p></>}
      {modal === "habit" && <><label>Habit name<input autoFocus required maxLength={160} value={habitName} onChange={e => setHabitName(e.target.value)} placeholder="e.g. Read for 15 minutes"/></label><label>Frequency<select value={habitFrequency} onChange={e => setHabitFrequency(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><p className="myspace-modal-note"><CheckCircle2 size={13}/> You can check in from the habit card whenever you complete it.</p></>}
      <div className="myspace-modal-actions"><button type="button" className="myspace-ghost-button" onClick={() => setModal(null)}>Cancel</button><button className="myspace-submit" disabled={saving}>{saving ? "Saving…" : <><CheckCircle2 size={16}/> Save {modal === "goal" ? "goal" : modal === "reminder" ? "reminder" : "habit"}</>}</button></div>
    </form></div>}
  </section>;
}

function AlertTriangleIcon() { return <span className="myspace-alert-icon">!</span>; }
 