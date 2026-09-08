export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${className}`}>
      {/* Official Drip mark (public/logo.png). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Drip"
        width={26}
        height={26}
        className="h-[26px] w-[26px] shrink-0 rounded-full"
      />
      <span className="tracking-tight">Drip</span>
    </span>
  );
}
