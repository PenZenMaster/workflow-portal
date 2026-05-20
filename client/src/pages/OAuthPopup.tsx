import { useEffect } from "react";

export default function OAuthPopup() {
  useEffect(() => {
    const hash = window.location.hash.slice(1); // "/oauth/popup?type=success&clientId=4"
    const qi = hash.indexOf("?");
    const params = new URLSearchParams(qi >= 0 ? hash.slice(qi) : "");
    const type = params.get("type");
    const clientId = params.get("clientId");
    const error = params.get("error");

    if (window.opener) {
      if (type === "success") {
        window.opener.postMessage(
          { type: "ga4_oauth_success", clientId: Number(clientId) },
          window.location.origin
        );
      } else {
        window.opener.postMessage(
          { type: "ga4_oauth_error", error: error ?? "Connection failed" },
          window.location.origin
        );
      }
    }

    window.close();
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Connecting...</p>
    </div>
  );
}
