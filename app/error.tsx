"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#060a08] px-6 text-center">
      <h1 className="font-display text-4xl text-white">Something went wrong</h1>
      <p className="mt-4 max-w-md text-[#7a9a82]">
        {error.message || "The app hit an error loading today's slate."}
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-[#5a7a62]">Error ID: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-full border border-[#00e676]/50 bg-[#00e676]/10 px-6 py-3 text-sm font-semibold uppercase tracking-wider text-[#00e676] hover:bg-[#00e676]/20"
      >
        Try again
      </button>
    </div>
  );
}
