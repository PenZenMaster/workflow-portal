import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

function getToken(): string | null {
  return new URLSearchParams(window.location.search).get("token");
}

export function ResetPasswordPage() {
  const token = getToken();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            Invalid reset link — no token found.
          </p>
          <a href="/login" className="text-sm text-primary underline underline-offset-2">
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <Logo className="h-9 w-9 text-primary" />
          <div>
            <div className="text-base font-semibold tracking-tight">
              Workflow Portal
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider">
              <Lock className="h-3 w-3" />
              Private
            </div>
          </div>
        </div>

        <div className="border border-card-border bg-card rounded-lg p-6 shadow-sm">
          {done ? (
            <div className="space-y-3">
              <h1 className="text-lg font-semibold">Password updated</h1>
              <p className="text-sm text-muted-foreground">
                Your password has been changed and all other sessions have been
                signed out.
              </p>
              <a
                href="/login"
                className="block text-sm text-primary underline underline-offset-2 mt-2"
              >
                Sign in with your new password
              </a>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h1 className="text-lg font-semibold mb-1">Set a new password</h1>
                <p className="text-sm text-muted-foreground">
                  Choose a strong password. The link expires after 60 minutes.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    At least 10 characters.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Updating..." : "Set new password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
