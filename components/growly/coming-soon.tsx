export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
      <h1 className="text-xl font-extrabold mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground">Próximamente en una siguiente fase.</p>
    </div>
  )
}
