// Fixed ambient glow behind every screen. Purely decorative.
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-base">
      <div className="absolute -left-40 -top-40 size-[640px] rounded-full bg-violet/30 blur-[140px]" />
      <div className="absolute -bottom-48 -right-32 size-[620px] rounded-full bg-cyan/20 blur-[150px]" />
    </div>
  )
}
