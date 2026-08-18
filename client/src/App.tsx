import { Component, type ReactNode } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import { AuthScreen } from "@/pages/AuthScreen";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import ClientsList from "@/pages/ai/ClientsList";
import ClientDetail from "@/pages/ai/ClientDetail";
import PromptCollections from "@/pages/ai/PromptCollections";
import PromptCollectionDetail from "@/pages/ai/PromptCollectionDetail";
import RunsList from "@/pages/ai/RunsList";
import RunDetail from "@/pages/ai/RunDetail";
import ReviewQueue from "@/pages/ai/ReviewQueue";
import Reports from "@/pages/ai/Reports";
import SharePage from "@/pages/ai/SharePage";
import Integrations from "@/pages/ai/Integrations";
import OAuthPopup from "@/pages/OAuthPopup";
import Users from "@/pages/admin/Users";
import Jobs from "@/pages/admin/Jobs";
import Platforms from "@/pages/admin/Platforms";
import Help from "@/pages/Help";
import RankRocketSiteInsights from "@/pages/admin/RankRocketSiteInsights";
import SourceDomains from "@/pages/admin/SourceDomains";
import { Skeleton } from "@/components/ui/skeleton";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg font-semibold text-destructive">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-md">
            {(this.state.error as Error).message}
          </p>
          <button
            className="text-sm underline text-primary"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/share/:token" component={SharePage} />
      <Route path="/admin/users" component={Users} />
      <Route path="/admin/jobs" component={Jobs} />
      <Route path="/admin/platforms" component={Platforms} />
      <Route path="/help" component={Help} />
      <Route path="/admin/rankrocket-site-insights" component={RankRocketSiteInsights} />
      <Route path="/admin/source-domains" component={SourceDomains} />
      <Route path="/ai/clients/:id/settings/integrations" component={Integrations} />
      <Route path="/ai/clients/:id/sentiment/review" component={ReviewQueue} />
      <Route path="/ai/clients/:id/reports" component={Reports} />
      <Route path="/ai/runs/:runId" component={RunDetail} />
      <Route path="/ai/clients/:id/runs" component={RunsList} />
      <Route path="/ai/clients/:id/prompts/:collectionId" component={PromptCollectionDetail} />
      <Route path="/ai/clients/:id/prompts" component={PromptCollections} />
      <Route path="/ai/clients/:id" component={ClientDetail} />
      <Route path="/ai/clients" component={ClientsList} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Gate() {
  const { status, isLoading } = useAuth();

  // Public pre-auth routes — accessible regardless of login state.
  const pathname = window.location.pathname;
  if (pathname === "/forgot-password") return <ForgotPasswordPage />;
  if (pathname === "/reset-password") return <ResetPasswordPage />;
  if (window.location.hash.startsWith("#/oauth/popup")) return <OAuthPopup />;

  if (isLoading || !status) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-32 w-80" />
      </div>
    );
  }

  if (status.needsSetup) {
    return <AuthScreen mode="setup" />;
  }

  if (!status.authenticated) {
    return <AuthScreen mode="login" />;
  }

  return (
    <Router hook={useHashLocation}>
      <AppRouter />
    </Router>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <AuthProvider>
              <Gate />
            </AuthProvider>
            <div className="fixed bottom-2 right-3 text-xs text-muted-foreground/40 select-none pointer-events-none z-50">
              v{__APP_VERSION__}
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
