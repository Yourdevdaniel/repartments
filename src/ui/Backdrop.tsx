/**
 * The city behind the building: soft pastel blocks and treetops, blurred like a shallow depth of field
 * so the sharp diorama stands out. It drifts closer and blurs more when you step into a flat.
 */
export function Backdrop({ near }: { near: boolean }) {
  const far = [
    [40, 330], [150, 260], [250, 380], [370, 300], [470, 410], [560, 280], [690, 350],
    [820, 300], [930, 420], [1040, 290], [1150, 360], [1270, 270], [1380, 390], [1490, 310],
  ]
  const trees = [90, 210, 330, 470, 620, 760, 900, 1050, 1190, 1330, 1470]
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
        <rect width="1600" height="900" fill="url(#sun)" />
        {far.map(([x, h], i) => (
          <g key={x}>
            <rect x={x} y={760 - h} width={i % 3 ? 96 : 120} height={h + 140} rx="10" fill={i % 2 ? '#cdd5f6' : '#d8def9'} />
            {Array.from({ length: Math.floor(h / 60) }, (_, r) => (
              <rect key={r} x={x + 18} y={790 - h + r * 56} width={i % 3 ? 60 : 84} height="14" rx="4" fill="#eef1ff" opacity="0.8" />
            ))}
          </g>
        ))}
        {trees.map((x, i) => (
          <g key={x}>
            <circle cx={x} cy={735 - (i % 3) * 18} r={58 + (i % 2) * 14} fill={i % 2 ? '#bfe2b4' : '#cbe9bd'} />
            <circle cx={x + 50} cy={760} r={44} fill="#c4e5b7" />
          </g>
        ))}
        <rect y="760" width="1600" height="140" fill="#d6edc8" />
      </svg>
    </div>
  )
}
