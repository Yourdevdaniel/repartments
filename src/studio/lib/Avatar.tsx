import { initials } from './people'

/** A 24 px round avatar; the author's initials stand in when GitHub has no picture for the e-mail. */
export function Avatar({ name, src, size = 24 }: { name: string; src: string | null; size?: number }) {
  if (src) {
    return <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full bg-ink/5" style={{ width: size, height: size }} />
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-extrabold text-accent"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  )
}
