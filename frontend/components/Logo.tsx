export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${className}`}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* A droplet — the Drip mark. */}
        <path
          d="M12 2.5c3.6 4.2 6.5 7.9 6.5 11.4A6.5 6.5 0 0 1 12 20.4a6.5 6.5 0 0 1-6.5-6.5C5.5 10.4 8.4 6.7 12 2.5Z"
          fill="#c6f24e"
        />
        <circle cx="9.7" cy="13.6" r="1.7" fill="#0a0b0d" opacity="0.85" />
      </svg>
      <span className="tracking-tight">Drip</span>
    </span>
  );
}
