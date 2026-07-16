import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BookOpen, Timer, HeartPulse, CalendarDays, Sparkles } from "lucide-react";
import { useAuth, FullPageSpinner } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  if (loading) return <FullPageSpinner />;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium">StudyFlow</span>
        </div>
        <h1 className="mt-6 text-4xl sm:text-6xl font-semibold text-foreground max-w-3xl">
          Focus, revise, and stay well — all in one calm dashboard.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Built for IGCSE students. Track subjects, plan revision, review flashcards with spaced
          repetition, and check in with yourself every day.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center rounded-2xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            Get started
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center rounded-2xl border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-muted"
          >
            I already have an account
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: BookOpen, title: "Subjects", desc: "Track exam dates and readiness." },
            { icon: CalendarDays, title: "Revision", desc: "Auto-planned by exam proximity." },
            { icon: Timer, title: "Focus", desc: "Pomodoro sessions per subject." },
            { icon: HeartPulse, title: "Check-in", desc: "Mood, sleep and screen time." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
