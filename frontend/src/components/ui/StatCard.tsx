export function StatCard({ label, value }: { label: string; value: number }) {
  return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>;
}
