// Fixed ambient glow behind every screen. Purely decorative.
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-base">
      <div className="ambient-orb ambient-orb-blue absolute -left-40 -top-48 size-[620px] rounded-full bg-cyan/20 blur-[130px] dark:bg-violet/30" />
      <div className="ambient-orb ambient-orb-pink absolute -bottom-48 -right-32 size-[620px] rounded-full bg-pink/20 blur-[150px] dark:bg-cyan/20" />
      <div className="ambient-orb absolute left-1/3 top-1/3 size-[420px] rounded-full bg-violet/10 blur-[160px] dark:bg-pink/10" />
    </div>
  )
}
