/**
 * A charger and a car joined by a cable, energy running along it and the
 * car's battery filling: the picture on the sign-in screen and the
 * "signing in" moment. Drawn, not a photo, so it stays sharp and light.
 */
const CABLE = 'M86 112 C 96 150, 150 150, 176 128';

export default function ChargeScene({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const ink = dark ? '#F5F5F0' : '#111111';
  const body = dark ? '#1c1c1c' : '#FFFFFF';
  return (
    <svg viewBox="0 0 360 170" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pg-cs-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFC83D" stopOpacity=".45" />
          <stop offset="1" stopColor="#FFC83D" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pg-cs-bat" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E09A00" />
          <stop offset=".6" stopColor="#FFC83D" />
          <stop offset="1" stopColor="#FFE27A" />
        </linearGradient>
      </defs>
      {/* The road under them */}
      <path d="M6 156 H354" stroke={ink} strokeOpacity=".14" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 164 H90 M130 164 H180 M220 164 H270 M310 164 H350" stroke={ink} strokeOpacity=".1" strokeWidth="2" strokeLinecap="round" />
      {/* The charger: a column with a lit screen and a bolt */}
      <ellipse cx="70" cy="156" rx="34" ry="5" fill={ink} opacity=".08" />
      <rect x="48" y="40" width="44" height="114" rx="12" fill="#111111" />
      <rect x="55" y="50" width="30" height="34" rx="6" fill="#FFC83D" />
      <path d="M72 55 L63 69 H70 L67 79 L77 64 H70 Z" fill="#111111" />
      <rect x="55" y="92" width="30" height="4" rx="2" fill="#FFC83D" opacity=".55" />
      <rect x="84" y="100" width="10" height="16" rx="3" fill="#2a2a2a" />
      <rect x="40" y="24" width="60" height="6" rx="3" fill="url(#pg-cs-glow)" />
      {/* The cable, with energy running along it */}
      <path d={CABLE} fill="none" stroke="#111111" strokeWidth="4.5" strokeLinecap="round" />
      <path d={CABLE} fill="none" stroke="#FFC83D" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 10">
        <animate attributeName="stroke-dashoffset" from="64" to="0" dur="1s" repeatCount="indefinite" />
      </path>
      {[0, 0.33, 0.66].map(d => (
        <circle key={d} r="3.4" fill="#FFE27A" style={{ filter: 'drop-shadow(0 0 4px #FFC83D)' }}>
          <animateMotion dur="1.2s" begin={`${d * 1.2}s`} repeatCount="indefinite" path={CABLE} />
        </circle>
      ))}
      {/* The car, side on, its lights on */}
      <ellipse cx="262" cy="156" rx="96" ry="6" fill={ink} opacity=".08" />
      <path d="M172 136 C171 126 178 120 194 118 L222 114 C236 102 256 94 282 93 C305 93 322 99 338 112 L350 116 C356 118 358 124 358 131 L357 138 C357 142 355 144 351 144 L340 144 A15 15 0 0 0 310 144 L222 144 A15 15 0 0 0 192 144 L178 144 C174 144 172 141 172 136 Z" fill={body} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
      <path d="M226 116 C238 106 256 100 280 99 C298 99 312 104 326 114 Z" fill={ink} opacity=".85" />
      <path d="M278 99 L276 116" stroke={body} strokeWidth="2.5" />
      <path d="M344 120 L354 123" stroke="#FFC83D" strokeWidth="4" strokeLinecap="round" />
      {[207, 325].map(x => (
        <g key={x}>
          <circle cx={x} cy="145" r="13" fill="#111111" />
          <circle cx={x} cy="145" r="5" fill="#9a9a9a" />
        </g>
      ))}
      {/* The battery over the car, filling */}
      <g transform="translate(236 56)">
        <rect x="0" y="0" width="58" height="26" rx="7" fill={body} stroke={ink} strokeWidth="2.6" />
        <rect x="58.5" y="8" width="4" height="10" rx="1.5" fill={ink} />
        <rect x="4" y="4" width="50" height="18" rx="4" fill="url(#pg-cs-bat)">
          <animate attributeName="width" values="6;50;50" keyTimes="0;0.8;1" dur="2.4s" repeatCount="indefinite" />
        </rect>
        <path d="M30 6 L23 14 H29 L26 21 L34 11 H28 Z" fill="#111111" />
      </g>
      <path d="M262 84 V104" stroke={ink} strokeOpacity=".25" strokeWidth="2" strokeDasharray="3 4" />
    </svg>
  );
}
