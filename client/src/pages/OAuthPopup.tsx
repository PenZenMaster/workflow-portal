import { useEffect } from "react";

export default function OAuthPopup() {
  useEffect(() => {
    const hash = window.location.hash.slice(1); // "/oauth/popup?type=success&clientId=4"
    const qi = hash.indexOf("?");
    const params = new URLSearchParams(qi >= 0 ? hash.slice(qi) : "");
    const type = params.get("type");
    const clientId = params.get("clientId");
    const error = params.get("error");

    // BroadcastChannel is used instead of window.opener.postMessage because
    // Google's consent page sets Cross-Origin-Opener-Policy: same-origin,
    // which severs window.opener by the time the popup returns to this origin.
    const channel = new BroadcastChannel("ga4_oauth");
    if (type === "success") {
      channel.postMessage({ type: "ga4_oauth_success", clientId: Number(clientId) });
    } else {
      channel.postMessage({ type: "ga4_oauth_error", error: error ?? "Connection failed" });
    }
    channel.close();
    window.close();
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Connecting...</p>
    </div>
  );
}
