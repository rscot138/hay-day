export default function GrassCut({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} fill="none">
      <path d="m10 52 2-12 4 12z" fill="#4caf50" />
      <path d="m14 52 3-12 4 12z" fill="#81c784" />
      <path d="m19 52 3-12 4 12z" fill="#4caf50" />
      <path d="m24 52 3-12 4 12z" fill="#81c784" />
      <path d="M34 52s3-28-2-38c3 10 8 26 8 38z" fill="#2e7d32" />
      <path d="M39 52s5-32 3-42c3 12 5 28 5 42z" fill="#4caf50" />
      <path d="M46 52s2-24 7-34c-3 12-3 24-3 34z" fill="#81c784" />
      <path d="M6 52h52" stroke="#2e7d32" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
