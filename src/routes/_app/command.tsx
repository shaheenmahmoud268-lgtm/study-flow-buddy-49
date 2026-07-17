import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  Crown,
  Zap,
  Rewind,
  Trophy,
  Snowflake,
  Bomb,
  Sparkles,
  Trees,
  Download,
  AlertTriangle,
  Flame,
  Rocket,
  ShieldCheck,
  Wand2,
  Calendar,
  Layers,
  Timer,
  HeartPulse,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth, FullPageSpinner } from "@/lib/auth-context";
import { useSubjects, useAllTasks } from "@/lib/firestore-hooks";
import { addDaysISO, todayISO } from "@/lib/dates";

export const Route = createFileRoute("/_app/command")({
  ssr: false,
  component: CommandCenter,
});

function CommandCenter() {
  const { user } = useAuth();
  const uid = user?.uid;
  const navigate = useNavigate();
  const subjects = useSubjects(uid);
  const tasks = useAllTasks(uid, subjects);

  const [role, setRole] = useState<string | undefined>(undefined);
  const [godMode, setGodMode] = useState(false);
  const [xp, setXp] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [flashCount, setFlashCount] = useState(0);
  const [focusMinutes, setFocusMinutes] = useState(0);

  // Load user doc (role, godMode, xp)
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      const d = snap.data();
      if (d) {
        setRole(d.role);
        setGodMode(Boolean(d.godMode));
        setXp(typeof d.xp === "number" ? d.xp : 0);
      }
    });
    return unsub;
  }, [uid]);

  // Redirect non-CEO away
  useEffect(() => {
    if (role !== undefined && role !== "ceo") {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [role, navigate]);

  // Live counts: flashcards and focus session minutes
  useEffect(() => {
    if (!uid || !subjects) return;
    const flashUnsubs = subjects.map((s) =>
      onSnapshot(collection(db, "users", uid, "subjects", s.id, "flashcards"), () => {
        // Recount across all subjects
        Promise.all(
          subjects.map((sub) =>
            getDocs(collection(db, "users", uid, "subjects", sub.id, "flashcards")),
          ),
        ).then((snaps) => {
          setFlashCount(snaps.reduce((n, snap) => n + snap.size, 0));
        });
      }),
    );
    const focusUnsub = onSnapshot(collection(db, "users", uid, "focusSessions"), (snap) => {
      let mins = 0;
      snap.forEach((d) => {
        const v = d.data()?.durationMinutes;
        if (typeof v === "number") mins += v;
      });
      setFocusMinutes(mins);
    });
    return () => {
      flashUnsubs.forEach((u) => u());
      focusUnsub();
    };
  }, [uid, subjects]);

  const stats = useMemo(() => {
    const t = tasks ?? [];
    const done = t.filter((x) => x.isComplete).length;
    const pending = t.length - done;
    const overdue = t.filter((x) => !x.isComplete && x.dueDate < todayISO()).length;
    return {
      subjects: subjects?.length ?? 0,
      tasks: t.length,
      done,
      pending,
      overdue,
    };
  }, [tasks, subjects]);

  const level = Math.floor(xp / 100) + 1;
  const xpInLevel = xp % 100;

  const run = async (id: string, fn: () => Promise<unknown>, xpAward = 10) => {
    if (!uid) return;
    setBusy(id);
    try {
      await fn();
      // Award XP for using power moves
      if (xpAward > 0) {
        await updateDoc(doc(db, "users", uid), { xp: xp + xpAward });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ============ ACTIONS ============

  const toggleGodMode = async () => {
    if (!uid) return;
    await setDoc(doc(db, "users", uid), { godMode: !godMode }, { merge: true });
    toast.success(!godMode ? "God Mode ON. You are limitless." : "God Mode disabled.");
  };

  const completeAllToday = async () => {
    if (!tasks) return;
    const today = todayISO();
    const due = tasks.filter((t) => t.dueDate <= today && !t.isComplete);
    if (due.length === 0) return toast.info("Nothing pending — you're already ahead.");
    const batch = writeBatch(db);
    due.forEach((t) => {
      batch.update(doc(db, "users", uid!, "subjects", t.subjectId, "tasks", t.id), {
        isComplete: true,
        completedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
    toast.success(`Vaporized ${due.length} task(s) 🔥`);
  };

  const rewindYesterday = async () => {
    if (!tasks) return;
    const y = addDaysISO(todayISO(), -1);
    const missed = tasks.filter((t) => t.dueDate === y && !t.isComplete);
    if (missed.length === 0) return toast.info("No missed tasks from yesterday.");
    const batch = writeBatch(db);
    const backdate = new Date();
    backdate.setDate(backdate.getDate() - 1);
    missed.forEach((t) => {
      batch.update(doc(db, "users", uid!, "subjects", t.subjectId, "tasks", t.id), {
        isComplete: true,
        completedAt: backdate.toISOString(),
      });
    });
    await batch.commit();
    toast.success(`Rewound time. ${missed.length} task(s) marked done for yesterday ⏪`);
  };

  const perfectWeek = async () => {
    if (!tasks) return;
    const today = todayISO();
    const end = addDaysISO(today, 7);
    const upcoming = tasks.filter(
      (t) => !t.isComplete && t.dueDate >= today && t.dueDate <= end,
    );
    if (upcoming.length === 0) return toast.info("No tasks in the next 7 days.");
    const batch = writeBatch(db);
    upcoming.forEach((t) => {
      batch.update(doc(db, "users", uid!, "subjects", t.subjectId, "tasks", t.id), {
        isComplete: true,
        completedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
    toast.success(`Perfect week locked in. ${upcoming.length} task(s) crushed 🏆`);
  };

  const streakFreeze = async () => {
    if (!subjects || subjects.length === 0) return toast.error("Add a subject first.");
    const subj = subjects[0];
    // Insert a completed "focus" task for today to keep streak alive
    await addDoc(collection(db, "users", uid!, "subjects", subj.id, "tasks"), {
      title: "Streak preserved (elite)",
      type: "revision",
      dueDate: todayISO(),
      isComplete: true,
      completedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    toast.success("Streak frozen ❄️ — today's activity guaranteed.");
  };

  const gradeBooster = async () => {
    if (!subjects) return;
    const batch = writeBatch(db);
    subjects.forEach((s) => {
      batch.update(doc(db, "users", uid!, "subjects", s.id), { targetGrade: "A*" });
    });
    await batch.commit();
    toast.success(`All ${subjects.length} subject(s) upgraded to A* 🎯`);
  };

  const massFocusLog = async () => {
    if (!subjects || subjects.length === 0) return toast.error("Add a subject first.");
    const now = new Date();
    await Promise.all(
      Array.from({ length: 5 }).map((_, i) => {
        const subj = subjects[i % subjects.length];
        return addDoc(collection(db, "users", uid!, "focusSessions"), {
          subjectId: subj.id,
          subjectName: subj.subjectName,
          durationMinutes: 25,
          completedAt: new Date(now.getTime() - i * 60_000).toISOString(),
          createdAt: serverTimestamp(),
        });
      }),
    );
    toast.success("Logged 5 × 25-min focus sessions 🚀");
  };

  const moodFabricator = async () => {
    const batch = writeBatch(db);
    for (let i = 0; i < 14; i++) {
      const date = addDaysISO(todayISO(), -i);
      batch.set(doc(db, "users", uid!, "dailyCheckins", date), {
        date,
        mood: 5,
        sleepHours: 8,
        screenTimeHours: 2,
        notes: "Elite state.",
        createdAt: new Date().toISOString(),
      });
    }
    await batch.commit();
    toast.success("14 days of perfect check-ins written 🧘");
  };

  const flashcardGenesis = async () => {
    if (!subjects || subjects.length === 0) return toast.error("Add a subject first.");
    await Promise.all(
      subjects.flatMap((s) =>
        Array.from({ length: 3 }).map((_, i) =>
          addDoc(collection(db, "users", uid!, "subjects", s.id, "flashcards"), {
            question: `${s.subjectName} — key concept #${i + 1}`,
            answer: "Fill in when reviewing.",
            easeFactor: 2.5,
            intervalDays: 1,
            repetitions: 0,
            nextReviewDate: todayISO(),
            lastReviewed: null,
            createdAt: serverTimestamp(),
          }),
        ),
      ),
    );
    toast.success(`Spawned ${subjects.length * 3} starter flashcards ✨`);
  };

  const exportData = async () => {
    if (!uid) return;
    const userSnap = await getDocs(collection(db, "users", uid, "subjects"));
    const payload: {
      exportedAt: string;
      uid: string;
      subjects: unknown[];
      focusSessions: unknown[];
      dailyCheckins: unknown[];
    } = {
      exportedAt: new Date().toISOString(),
      uid,
      subjects: [],
      focusSessions: [],
      dailyCheckins: [],
    };
    for (const s of userSnap.docs) {
      const [tSnap, cSnap] = await Promise.all([
        getDocs(collection(db, "users", uid, "subjects", s.id, "tasks")),
        getDocs(collection(db, "users", uid, "subjects", s.id, "flashcards")),
      ]);
      payload.subjects.push({
        id: s.id,
        ...s.data(),
        tasks: tSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        flashcards: cSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    }
    const [fSnap, cSnap] = await Promise.all([
      getDocs(collection(db, "users", uid, "focusSessions")),
      getDocs(collection(db, "users", uid, "dailyCheckins")),
    ]);
    payload.focusSessions = fSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    payload.dailyCheckins = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studyflow-export-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Full data export downloaded 📦");
  };

  const nukePending = async () => {
    if (!tasks) return;
    if (!confirm("Delete every pending task? This can't be undone.")) return;
    const pending = tasks.filter((t) => !t.isComplete);
    if (pending.length === 0) return toast.info("Nothing pending.");
    // Chunk into batches of 400 (Firestore limit 500)
    for (let i = 0; i < pending.length; i += 400) {
      const batch = writeBatch(db);
      pending.slice(i, i + 400).forEach((t) => {
        batch.delete(doc(db, "users", uid!, "subjects", t.subjectId, "tasks", t.id));
      });
      await batch.commit();
    }
    toast.success(`Nuked ${pending.length} pending task(s) 💣`);
  };

  if (role === undefined) return <FullPageSpinner />;
  if (role !== "ceo") return null;

  const actions: {
    id: string;
    icon: typeof Zap;
    title: string;
    desc: string;
    color: string;
    onClick: () => Promise<unknown>;
    xp?: number;
  }[] = [
    {
      id: "complete-today",
      icon: Zap,
      title: "Vaporize today",
      desc: "Complete every task due today or earlier, instantly.",
      color: "amber",
      onClick: completeAllToday,
    },
    {
      id: "rewind",
      icon: Rewind,
      title: "Rewind yesterday",
      desc: "Backdate missed tasks so your streak stays intact.",
      color: "sky",
      onClick: rewindYesterday,
    },
    {
      id: "perfect-week",
      icon: Trophy,
      title: "Perfect week",
      desc: "Auto-crush every task in the next 7 days.",
      color: "emerald",
      onClick: perfectWeek,
      xp: 30,
    },
    {
      id: "streak-freeze",
      icon: Snowflake,
      title: "Streak freeze",
      desc: "Guarantee today counts toward your streak.",
      color: "cyan",
      onClick: streakFreeze,
    },
    {
      id: "grade-boost",
      icon: Rocket,
      title: "Grade booster",
      desc: "Set every subject's target grade to A*.",
      color: "violet",
      onClick: gradeBooster,
    },
    {
      id: "focus-mass",
      icon: Timer,
      title: "Mass focus log",
      desc: "Log 5 × 25-min sessions across your subjects.",
      color: "orange",
      onClick: massFocusLog,
    },
    {
      id: "mood-fab",
      icon: HeartPulse,
      title: "Mood streak",
      desc: "Fabricate 14 days of perfect check-ins.",
      color: "pink",
      onClick: moodFabricator,
    },
    {
      id: "flash-gen",
      icon: Layers,
      title: "Flashcard genesis",
      desc: "Spawn 3 starter cards per subject.",
      color: "indigo",
      onClick: flashcardGenesis,
    },
    {
      id: "export",
      icon: Download,
      title: "Full data export",
      desc: "Download every subject, task, card, and session as JSON.",
      color: "slate",
      onClick: exportData,
    },
    {
      id: "nuke",
      icon: Bomb,
      title: "Nuke pending",
      desc: "Delete every incomplete task. Irreversible.",
      color: "rose",
      onClick: nukePending,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-br from-amber-500/10 via-background to-primary/10 p-6 sm:p-8 shadow-sm">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-500">
              <Crown className="h-3.5 w-3.5" /> Elite CEO Access
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight">
              Command Center
            </h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Unfair advantages, one click each. Every action awards XP.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-border bg-card/60 backdrop-blur px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Level
              </div>
              <div className="text-2xl font-semibold flex items-center gap-1">
                {level}
                <Flame className="h-5 w-5 text-amber-500" />
              </div>
              <div className="mt-1 h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${xpInLevel}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">{xp} XP total</div>
            </div>

            <button
              onClick={toggleGodMode}
              className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                godMode
                  ? "border-amber-400 bg-amber-500 text-white shadow-lg shadow-amber-500/30"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              <ShieldCheck className="h-4 w-4 mb-1" />
              <div className="text-xs">God Mode</div>
              <div className="text-[10px] opacity-80">{godMode ? "ON" : "OFF"}</div>
            </button>
          </div>
        </div>

        {/* Live stats */}
        <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Subjects" value={stats.subjects} />
          <Stat label="Tasks done" value={stats.done} />
          <Stat label="Pending" value={stats.pending} accent={stats.overdue > 0 ? "warn" : ""} />
          <Stat label="Flashcards" value={flashCount} />
          <Stat label="Focus mins" value={focusMinutes} />
        </div>
      </section>

      {/* Power actions grid */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="h-4 w-4 text-amber-500" />
          <h2 className="text-lg font-semibold">Power moves</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((a) => (
            <ActionCard
              key={a.id}
              icon={a.icon}
              title={a.title}
              desc={a.desc}
              color={a.color}
              busy={busy === a.id}
              disabled={!!busy}
              onClick={() => run(a.id, a.onClick, a.xp ?? 10)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-rose-400/30 bg-rose-500/5 p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">These are irreversible for other users.</p>
          <p className="text-muted-foreground">
            Command Center actions only run against your own account and respect Firestore
            security rules.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-card/70 backdrop-blur border border-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-semibold ${accent === "warn" ? "text-amber-500" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  desc,
  color,
  busy,
  disabled,
  onClick,
}: {
  icon: typeof Zap;
  title: string;
  desc: string;
  color: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    amber: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    sky: "text-sky-500 bg-sky-500/10 border-sky-500/30",
    emerald: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    cyan: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30",
    violet: "text-violet-500 bg-violet-500/10 border-violet-500/30",
    orange: "text-orange-500 bg-orange-500/10 border-orange-500/30",
    pink: "text-pink-500 bg-pink-500/10 border-pink-500/30",
    indigo: "text-indigo-500 bg-indigo-500/10 border-indigo-500/30",
    slate: "text-slate-500 bg-slate-500/10 border-slate-500/30",
    rose: "text-rose-500 bg-rose-500/10 border-rose-500/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group text-left rounded-2xl border border-border bg-card p-4 shadow-sm hover:border-primary/60 hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${colorMap[color]}`}>
        {busy ? (
          <Sparkles className="h-5 w-5 animate-spin" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
      <div className="mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition">
        Run →
      </div>
    </button>
  );
}
