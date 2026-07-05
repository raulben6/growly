export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-[10px] bg-primary"
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none"
        stroke="#062e22" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19 L10 12 L14 15 L20 6" />
      </svg>
    </div>
  )
}

export function Wordmark() {
  return <span className="text-xl font-extrabold tracking-[-0.01em] text-foreground">Growly</span>
}
