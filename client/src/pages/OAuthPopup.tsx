import { useEffect, useState } from "react";

export default function OAuthPopup() {
  const hash = window.location.hash.slice(1);
  const qi = hash.indexOf("?");
  const params = new URLSearchParams(qi >= 0 ? hash.slice(qi) : "");
  const success = params.get("type") === "success";
  const errorMsg = params.get("error");

  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!success) return;
    if (countdown <= 0) { window.close(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [success, countdown]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-8 text-center">
      {success ? (
        <>
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold">Google Analytics connected</p>
          <p className="text-sm text-muted-foreground">Closing in {countdown}…</p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-destructive">Connection failed</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {errorMsg ? decodeURIComponent(errorMsg) : "An unexpected error occurred."}
          </p>
          <p className="text-xs text-muted-foreground mt-2">You can close this window and try again.</p>
        </>
      )}
    </div>
  );
}
