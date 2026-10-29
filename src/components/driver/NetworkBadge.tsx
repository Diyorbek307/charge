import { networkLook } from '../../lib/promos';

/** A partner network's badge: its colour and initials, with a % corner when it runs a promo. */
export function NetworkBadge({ name, size = 32, promo = false }: { name: string; size?: number; promo?: boolean }) {
  const look = networkLook(name);
  return (
    <span className="relative shrink-0 inline-grid place-items-center rounded-[30%] text-white font-extrabold" style={{ width: size, height: size, background: look.color, fontSize: Math.round(size * 0.36), letterSpacing: '-0.02em' }} aria-hidden="true">
      {look.initials}
      {promo && (
        <span className="absolute -top-1 -right-1 rounded-full bg-[#FF3B30] text-white grid place-items-center font-black border-2 border-white" style={{ width: Math.max(16, size * 0.45), height: Math.max(16, size * 0.45), fontSize: Math.max(9, size * 0.24) }}>%</span>
      )}
    </span>
  );
}
