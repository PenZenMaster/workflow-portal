import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Mode = "login" | "setup";

export function AuthScreen({ mode }: { mode: Mode }) {
  const { login, setup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSetup = mode === "setup";
  const title = isSetup ? "Create your admin account" : "Sign in";
  const subtitle = isSetup
    ? "First-run setup. This becomes the owner account for the portal."
    : "Enter your credentials to access the workflow portal.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSetup) {
      if (password.length < 10) {
        setError("Password must be at least 10 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setBusy(true);
    try {
      if (isSetup) {
        await setup(username.trim(), password);
      } else {
        await login(username.trim(), password);
      }
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      // apiRequest throws "STATUS: body". Surface a clean message.
      if (msg.includes("401")) setError("Invalid username or password.");
      else if (msg.includes("409")) setError("Username already taken.");
      else if (msg.includes("400")) setError("Check your inputs and try again.");
      else setError(msg || "Something went wrong. Try again.");
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
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              {isSetup && <ShieldCheck className="h-4 w-4 text-primary" />}
              <h1 className="text-lg font-semibold">{title}</h1>
            </div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-auth">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                data-testid="input-auth-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSetup ? "new-password" : "current-password"}
                required
                data-testid="input-auth-password"
              />
              {isSetup && (
                <p className="text-xs text-muted-foreground">
                  At least 10 characters. Use a long passphrase.
                </p>
              )}
            </div>
            {isSetup && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  data-testid="input-auth-confirm"
                />
              </div>
            )}

            {error && (
              <div
                className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2"
                data-testid="text-auth-error"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={busy}
              data-testid="button-auth-submit"
            >
              {busy
                ? isSetup
                  ? "Creating..."
                  : "Signing in..."
                : isSetup
                ? "Create account"
                : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Sessions persist for 30 days. Sign out from the header anytime.
        </p>
      </div>
    </div>
  );
}
