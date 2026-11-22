// Fixed ambient glow behind every screen. Purely decorative.
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-base">
      <div className="ambient-orb absolute -left-40 -top-40 size-[640px] rounded-full bg-cyan/15 blur-[140px] dark:bg-violet/30" />
      <div className="ambient-orb ambient-orb-pink absolute -bottom-48 -right-32 size-[620px] rounded-full bg-pink/15 blur-[150px] dark:bg-cyan/20" />
    </div>
  )
}
