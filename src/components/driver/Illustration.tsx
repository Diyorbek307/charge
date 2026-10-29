/**
 * A friendly scene for empty screens: a smiling charger plugged into a little
 * yellow car, with sparks. Drawn inline so it themes with the brand and costs
 * no request.
 */
export function ChargerFriend({ size = 168, mood = 'happy' }: { size?: number; mood?: 'happy' | 'wait' }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 200 144" fill="none" aria-hidden="true">
      <ellipse cx="100" cy="128" rx="86" ry="9" fill="#16161A" opacity=".07" />
      {/* cable */}
      <path d="M58 92c10 26 36 30 62 22" stroke="#16161A" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* car */}
      <g>
        <path d="M104 84c4-14 12-22 30-22h20c14 0 22 8 28 20l6 3c5 2 8 7 8 12v12c0 4-3 7-7 7H104c-4 0-7-3-7-7V96c0-6 3-10 7-12z" fill="#FFC83D" />
        <path d="M122 80c3-7 7-10 14-10h16c8 0 13 4 17 10z" fill="#16161A" opacity=".85" />
        <circle cx="122" cy="118" r="10" fill="#16161A" />
        <circle cx="122" cy="118" r="4" fill="#E4E4DD" />
        <circle cx="172" cy="118" r="10" fill="#16161A" />
        <circle cx="172" cy="118" r="4" fill="#E4E4DD" />
        <rect x="186" y="92" width="7" height="5" rx="2" fill="#FFF3C4" />
      </g>
      {/* charger with a face */}
      <g className="pg-float">
        <rect x="30" y="34" width="44" height="76" rx="12" fill="#16161A" />
        <rect x="37" y="42" width="30" height="24" rx="7" fill="#FFC83D" />
        {mood === 'happy' ? (
          <>
            <circle cx="46" cy="52" r="2.6" fill="#16161A" />
            <circle cx="58" cy="52" r="2.6" fill="#16161A" />
            <path d="M45 58c3.5 3.5 10.5 3.5 14 0" stroke="#16161A" strokeWidth="2.4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M43 52h6M55 52h6" stroke="#16161A" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M47 60h10" stroke="#16161A" strokeWidth="2.4" strokeLinecap="round" />
          </>
        )}
        <path d="M54 74l-7 11h6l-2 9 8-12h-6z" fill="#FFC83D" />
        <rect x="26" y="106" width="52" height="8" rx="4" fill="#16161A" />
      </g>
      {/* sparks */}
      <path className="pg-spark" d="M92 30l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#FFB000" />
      <path className="pg-spark" style={{ animationDelay: '.6s' }} d="M150 30l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8z" fill="#FFC83D" />
      <circle className="pg-spark" style={{ animationDelay: '1.1s' }} cx="118" cy="46" r="3" fill="#FFD66B" />
    </svg>
  );
}
