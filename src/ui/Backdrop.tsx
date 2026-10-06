import type { Weather } from '../scene/weather'

const PALETTE: Record<Weather, { a: string; b: string; win: string; tree1: string; tree2: string; ground: string; sun: number }> = {
  sun: { a: '#cdd5f6', b: '#d8def9', win: '#eef1ff', tree1: '#bfe2b4', tree2: '#cbe9bd', ground: '#d6edc8', sun: 0.95 },
  clouds: { a: '#c9cfe0', b: '#d3d8e6', win: '#eceff6', tree1: '#b6d3ae', tree2: '#c0dab7', ground: '#cfe2c3', sun: 0.25 },
  rain: { a: '#aab3c8', b: '#b6bed0', win: '#d9dee9', tree1: '#9fbf9c', tree2: '#a9c8a4', ground: '#b9ceb2', sun: 0 },
  night: { a: '#2f3772', b: '#384183', win: '#ffe39a', tree1: '#2c5650', tree2: '#335f57', ground: '#24423f', sun: 0 },
}

/**
 * The city behind the building: soft blocks and treetops, blurred like a shallow depth of field so the
 * sharp diorama stands out. It follows the weather (lit windows and stars at night) and drifts closer,
 * blurring more, when you step into a flat.
 */
export function Backdrop({ near, weather }: { near: boolean; weather: Weather }) {
  const far = [
    [40, 330], [150, 260], [250, 380], [370, 300], [470, 410], [560, 280], [690, 350],
    [820, 300], [930, 420], [1040, 290], [1150, 360], [1270, 270], [1380, 390], [1490, 310],
  ]
  const trees = [90, 210, 330, 470, 620, 760, 900, 1050, 1190, 1330, 1470]
  const p = PALETTE[weather]
  const stars = weather === 'night'
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 transition-[transform,filter] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{ transform: near ? 'scale(1.12)' : 'scale(1)', filter: near ? 'blur(12px)' : 'blur(6px)' }}
    >
      <svg className="absolute inset-0 size-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="sun" cx="0.78" cy="0.18" r="0.35">
            <stop offset="0" stopColor="#fff4d6" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fff4d6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#sun)" opacity={p.sun} style={{ transition: 'opacity 2s' }} />
        {stars &&
          Array.from({ length: 60 }, (_, i) => (
            <circle key={i} cx={(i * 263) % 1600} cy={(i * 97) % 380} r={i % 5 === 0 ? 3 : 1.8} fill="#fff8e1" opacity={0.85} />
          ))}
        {stars && <circle cx="1230" cy="150" r="46" fill="#fff4cc" />}
        {far.map(([x, h], i) => (
          <g key={x}>
            <rect
              x={x}
              y={760 - h}
              width={i % 3 ? 96 : 120}
              height={h + 140}
              rx="10"
              fill={i % 2 ? p.a : p.b}
              style={{ transition: 'fill 2s' }}
            />
            {Array.from({ length: Math.floor(h / 60) }, (_, r) => (
              <rect
                key={r}
                x={x + 18}
                y={790 - h + r * 56}
                width={i % 3 ? 60 : 84}
                height="14"
                rx="4"
                fill={p.win}
                opacity={stars ? ((r + i) % 3 === 0 ? 0.25 : 0.9) : 0.8}
                style={{ transition: 'fill 2s' }}
              />
            ))}
          </g>
        ))}
        {trees.map((x, i) => (
          <g key={x}>
            <circle cx={x} cy={735 - (i % 3) * 18} r={58 + (i % 2) * 14} fill={i % 2 ? p.tree1 : p.tree2} style={{ transition: 'fill 2s' }} />
            <circle cx={x + 50} cy={760} r={44} fill={p.tree1} style={{ transition: 'fill 2s' }} />
          </g>
        ))}
        <rect y="760" width="1600" height="140" fill={p.ground} style={{ transition: 'fill 2s' }} />
      </svg>
    </div>
  )
}
