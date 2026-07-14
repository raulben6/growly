export function ReportStat({
  label, value, delta,
}: {
  label: string
  value: string
  delta: { text: string; good: boolean } | null
}) {
  return (
    <div className="flex-1 rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-[22px] font-extrabold text-foreground">{value}</div>
      {delta && (
        <div className={`mt-0.5 text-[11px] font-bold ${delta.good ? 'text-acc' : 'text-destructive'}`}>
          {delta.text}
        </div>
      )}
    </div>
  )
}
