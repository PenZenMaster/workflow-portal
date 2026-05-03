export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-label="Workflow Portal"
      role="img"
    >
      {/* concentric arcs converging to a square node — "many workflows, one place" */}
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <path
        d="M3 16 A13 13 0 0 1 16 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="13" y="13" width="6" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}
