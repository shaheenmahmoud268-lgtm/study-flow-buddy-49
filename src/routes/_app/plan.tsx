import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  Sparkles,
  Target,
  AlertTriangle,
  Loader2,
  CalendarPlus,
  Brain,
  TrendingUp,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useSubjects, useAllTasks } from "@/lib/firestore-hooks";
import { daysUntil, todayISO } from "@/lib/dates";
import { generateElitePlan, type ElitePlan } from "@/lib/plan.functions";

export const Route = createFileRoute("/_app/plan")({
  ssr: false,
  component: PlanPage,
});

function PlanPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const subjects = useSubjects(uid);
  const tasks = useAllTasks(uid, subjects);
  const generate = useServerFn(generateElitePlan);

  const [horizon, setHorizon] = useState(14);
  const [plan, setPlan] = useState<ElitePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);

  const snapshot = useMemo(() => {
    if (!subjects || !tasks) return null;
    const today = todayISO();
    return subjects.map((s) => {
      const rev = tasks.filter((t) => t.subjectId === s.id && t.type === "revision");
      const done = rev.filter((t) => t.isComplete).length;
      const dueSoFar = rev.filter((t) => t.dueDate <= today).length;
      const readiness = dueSoFar === 0 ? 0 : done / dueSoFar;
      return {
        id: s.id,
        subjectName: s.subjectName,
        examDate: s.examDate ?? "",
        targetGrade: s.targetGrade ?? "",
        daysUntilExam: s.examDate ? daysUntil(s.examDate) : 365,
        readiness,
        totalRevisionTasks: rev.length,
        completedRevisionTasks: done,
        overdueTasks: tasks.filter(
          (t) => t.subjectId === s.id && !t.isComplete && t.dueDate < today,
        ).length,
        upcomingTasks: tasks.filter(
          (t) => t.subjectId === s.id && !t.isComplete && t.dueDate >= today,
        ).length,
      };
    });
  }, [subjects, tasks]);

  const runGenerate = async () => {
    if (!uid || !snapshot || snapshot.length === 0) {
      toast.error("Add subjects first.");
      return;
    }
    setBusy(true);
    setPlan(null);
    try {
      // Pull recent check-ins for mood/sleep signal
      const cSnap = await getDocs(collection(db, "users", uid, "dailyCheckins"));
      const recent = cSnap.docs
        .map((d) => d.data() as { date: string; mood: number; sleepHours?: number })
        .filter((c) => c.date)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 7);

      const fSnap = await getDocs(collection(db, "users", uid, "focusSessions"));
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const focusMinutesLast7 = fSnap.docs.reduce((n, d) => {
        const v = d.data() as { completedAt?: string; durationMinutes?: number };
        if (v.completedAt && new Date(v.completedAt) >= since) {
          return n + (v.durationMinutes ?? 0);
        }
        return n;
      }, 0);

      const result = await generate({
        data: {
          studentName: user?.displayName ?? "student",
          today: todayISO(),
          horizonDays: horizon,
          subjects: snapshot,
          recentCheckins: recent.map((c) => ({
            date: c.date,
            mood: c.mood,
            sleepHours: c.sleepHours ?? 0,
          })),
          focusMinutesLast7,
        },
      });
      setPlan(result);
      toast.success("Elite plan ready. Review, then apply to your calendar.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applyPlan = async () => {
    if (!uid || !plan) return;
    setApplying(true);
    try {
      // Skip sessions that already exist (same subject + date + title)
      const writes: Promise<unknown>[] = [];
      let added = 0;
      let skipped = 0;
      for (const s of plan.sessions) {
        const existing = await getDocs(
          query(
            collection(db, "users", uid, "subjects", s.subjectId, "tasks"),
            where("dueDate", "==", s.date),
            where("title", "==", s.title),
          ),
        );
        if (!existing.empty) {
          skipped++;
          continue;
        }
        writes.push(
          addDoc(collection(db, "users", uid, "subjects", s.subjectId, "tasks"), {
            title: s.title,
            type: s.type,
            dueDate: s.date,
            isComplete: false,
            focusMinutes: s.focusMinutes,
            priority: s.priority,
            rationale: s.rationale,
            source: "elite-plan",
            createdAt: serverTimestamp(),
          }),
        );
        added++;
      }
      await Promise.all(writes);
      toast.success(`Added ${added} session${added === 1 ? "" : "s"} to your calendar${skipped ? ` · ${skipped} already existed` : ""}.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const sessionsByDate = useMemo(() => {
    if (!plan) return [];
    const map = new Map<string, ElitePlan["sessions"]>();
    plan.sessions.forEach((s) => {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [plan]);

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6 sm:p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Elite Study Plan
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight">
            Adaptive plan to hit your targets
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            AI reads your subjects, readiness %, upcoming exams, overdue tasks, mood and sleep — then
            schedules revision to maximise your grade outcomes.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              Horizon
              <select
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="rounded-xl border border-border bg-card px-2 py-1 text-sm"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={21}>21 days</option>
                <option value={30}>30 days</option>
                <option value={45}>45 days</option>
              </select>
            </label>
            <button
              onClick={runGenerate}
              disabled={busy || !snapshot || snapshot.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analysing…
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4" /> Generate Elite Plan
                </>
              )}
            </button>
            {plan && (
              <button
                onClick={applyPlan}
                disabled={applying}
                className="inline-flex items-center gap-2 rounded-2xl border border-primary/40 bg-card px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                {applying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarPlus className="h-4 w-4" />
                )}
                Apply to calendar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Readiness snapshot */}
      {snapshot && snapshot.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium truncate">{s.subjectName}</div>
                <span className="text-xs text-muted-foreground">
                  {s.daysUntilExam > 0 ? `${s.daysUntilExam}d` : "—"}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Target className="h-3 w-3" /> {s.targetGrade || "no target"}
                {s.overdueTasks > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" /> {s.overdueTasks} overdue
                  </span>
                )}
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-emerald-500"
                  style={{ width: `${Math.round(s.readiness * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Readiness {Math.round(s.readiness * 100)}%
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Plan */}
      {plan && (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2 text-primary">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Strategy</span>
            </div>
            <p className="mt-2 text-sm">{plan.summary}</p>
            <p className="mt-3 text-sm text-muted-foreground">{plan.strategy}</p>

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                Daily load: <b className="text-foreground">{plan.dailyLoadMinutes} min</b>
              </span>
              <span>
                Total sessions: <b className="text-foreground">{plan.sessions.length}</b>
              </span>
            </div>

            {plan.riskFlags.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Watch-outs
                </div>
                <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                  {plan.riskFlags.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Schedule</h2>
            {sessionsByDate.map(([date, list]) => (
              <div key={date} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {list.reduce((n, s) => n + s.focusMinutes, 0)} min
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {list.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3"
                    >
                      <span
                        className={`mt-1 h-2 w-2 rounded-full ${
                          s.priority === "critical"
                            ? "bg-rose-500"
                            : s.priority === "high"
                              ? "bg-amber-500"
                              : s.priority === "medium"
                                ? "bg-primary"
                                : "bg-muted-foreground"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{s.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.subjectName} · {s.focusMinutes} min · {s.priority}
                        </div>
                        {s.rationale && (
                          <div className="mt-1 text-[11px] text-muted-foreground italic">
                            {s.rationale}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {plan.checkinNudges.length > 0 && (
            <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
                Check-in nudges
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {plan.checkinNudges.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">
                      {new Date(n.date + "T00:00:00").toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span>{n.prompt}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {!plan && !busy && subjects && subjects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Add subjects and target grades first, then come back to generate your plan.
        </div>
      )}
    </div>
  );
}
