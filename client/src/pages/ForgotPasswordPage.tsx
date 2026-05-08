import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
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
              <h1 className="text-lg font-semibold">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                If an account exists for{" "}
                <span className="font-medium text-foreground">{email}</span>,
                a password reset link has been sent. The link expires in
                60 minutes.
              </p>
              <a
                href="/login"
                className="block text-sm text-primary underline underline-offset-2 mt-2"
              >
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h1 className="text-lg font-semibold mb-1">
                  Reset your password
                </h1>
                <p className="text-sm text-muted-foreground">
                  Enter the email address on your account. If it matches, we
                  will send a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Sending..." : "Send reset link"}
                </Button>
              </form>

              <a
                href="/login"
                className="block text-sm text-muted-foreground hover:text-foreground text-center mt-4 underline underline-offset-2"
              >
                Back to sign in
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
