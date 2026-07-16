import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Link } from "@tanstack/react-router";
import { Flame, Timer, CheckCircle2, Circle } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useSubjects, useAllTasks, type Task } from "@/lib/firestore-hooks";
import { todayISO } from "@/lib/dates";

export const Route = createFileRoute("/_app/dashboard")({
  ssr: false,
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const uid = user?.uid;
  const subjects = useSubjects(uid);
  const tasks = useAllTasks(uid, subjects);
  const today = todayISO();

  const todayTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.dueDate === today),
    [tasks, today]
  );

  const readiness = useMemo(() => {
    if (!subjects || !tasks) return [];
    return subjects.map((s) => {
      const rev = tasks.filter(
        (t) => t.subjectId === s.id && t.type === "revision" && t.dueDate <= today
      );
      const done = rev.filter((t) => t.isComplete).length;
      const total = rev.length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      return { ...s, pct, done, total };
    });
  }, [subjects, tasks, today]);

  const streak = useMemo(() => {
    if (!tasks) return 0;
    const days = new Set(
      tasks
        .filter((t) => t.isComplete && t.completedAt)
        .map((t) => (t.completedAt as string).slice(0, 10))
    );
    let count = 0;
    const d = new Date();
    while (true) {
      const iso = d.toISOString().slice(0, 10);
      if (days.has(iso)) {
        count++;
        d.setDate(d.getDate() - 1);
      } else {
        // Allow today to not yet have activity
        if (count === 0 && iso === today) {
          d.setDate(d.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return count;
  }, [tasks, today]);

  const toggleTask = async (t: Task) => {
    if (!uid) return;
    await updateDoc(
      doc(db, "users", uid, "subjects", t.subjectId, "tasks", t.id),
      {
        isComplete: !t.isComplete,
        completedAt: !t.isComplete ? new Date().toISOString() : null,
      }
    );
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const loading = !subjects || !tasks;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="mt-1 text-3xl sm:text-4xl font-semibold">
          {greeting()}, {user?.displayName || user?.email?.split("@")[0]}
        </h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flame className="h-4 w-4 text-primary" /> Streak
          </div>
          <p className="mt-2 text-4xl font-semibold">{streak}</p>
          <p className="text-sm text-muted-foreground">days in a row</p>
        </div>
        <Link
          to="/focus"
          className="rounded-2xl border border-border bg-primary text-primary-foreground p-5 shadow-sm hover:opacity-90 flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Timer className="h-4 w-4" /> Focus session
          </div>
          <p className="mt-4 text-lg font-medium">Start a 25-minute session →</p>
        </Link>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Readiness</h2>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : readiness.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No subjects yet. <Link to="/subjects" className="text-primary underline">Add one</Link>.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {readiness.map((r) => (
              <li key={r.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.subjectName}</span>
                  <span className="text-muted-foreground">
                    {r.total === 0 ? "no revision yet" : `${r.done}/${r.total} · ${r.pct}%`}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${r.pct}%`,
                      background: `linear-gradient(90deg, oklch(0.78 0.16 70), oklch(0.7 0.18 145))`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Today</h2>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : todayTasks.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing due today. Enjoy a breather, or plan ahead in the calendar.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {todayTasks.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => toggleTask(t)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted text-left"
                >
                  {t.isComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className={`flex-1 text-sm ${t.isComplete ? "line-through text-muted-foreground" : ""}`}>
                    {t.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{t.subjectName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
