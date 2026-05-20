import { useEffect } from "react";
import { useSearch } from "wouter";

export default function OAuthPopup() {
  const search = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(search);
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
