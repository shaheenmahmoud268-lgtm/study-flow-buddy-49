import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Play, Pause, RotateCcw, Sparkles } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useSubjects } from "@/lib/firestore-hooks";

export const Route = createFileRoute("/_app/focus")({
  ssr: false,
  component: FocusPage,
});

type Session = { subjectName: string; durationMinutes: number; completedAt: string };

function FocusPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const subjects = useSubjects(uid);
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [subjectId, setSubjectId] = useState("");
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (subjects && subjects.length > 0 && !subjectId) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(db, "users", uid, "focusSessions"), (snap) => {
      setSessions(snap.docs.map((d) => d.data() as Session));
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  useEffect(() => {
    if (secondsLeft !== 0 || !running) return;
    // phase ended
    setRunning(false);
    if (phase === "focus") {
      // log session
      const subj = subjects?.find((s) => s.id === subjectId);
      if (uid && subj) {
        addDoc(collection(db, "users", uid, "focusSessions"), {
          subjectId: subj.id,
          subjectName: subj.subjectName,
          durationMinutes: focusMin,
          completedAt: new Date().toISOString(),
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 2500);
      setPhase("break");
      setSecondsLeft(breakMin * 60);
    } else {
      setPhase("focus");
      setSecondsLeft(focusMin * 60);
    }
  }, [secondsLeft, running, phase, focusMin, breakMin, subjectId, subjects, uid]);

  const reset = () => {
    setRunning(false);
    setPhase("focus");
    setSecondsLeft(focusMin * 60);
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const chartData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const days: { day: string; minutes: number; date: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const mins = sessions
        .filter((s) => s.completedAt?.slice(0, 10) === iso)
        .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
      days.push({
        day: iso === today ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }),
        minutes: mins,
        date: iso,
      });
    }
    return days;
  }, [sessions]);

  const todayMin = chartData[chartData.length - 1]?.minutes ?? 0;
  const weekMin = chartData.reduce((s, d) => s + d.minutes, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Focus</h1>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-center relative overflow-hidden">
        <AnimatePresence>
          {celebrate && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-primary/10 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center gap-2 text-primary">
                <Sparkles className="h-10 w-10" />
                <p className="text-xl font-semibold">Nice work!</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {phase === "focus" ? "Focus" : "Break"}
        </p>
        <p className="mt-3 text-6xl sm:text-7xl font-semibold tabular-nums">
          {mm}:{ss}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={running}
            className="rounded-2xl border border-input bg-background px-3 py-2 text-sm"
          >
            {subjects?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subjectName}
              </option>
            ))}
          </select>
          <button
            onClick={() => setRunning((r) => !r)}
            disabled={!subjectId}
            className="inline-flex items-center gap-1 rounded-2xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pause" : "Start"}
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-2xl border border-border px-4 py-2 text-sm"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>

        <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-1">
            Focus
            <input
              type="number"
              min={5}
              max={90}
              value={focusMin}
              disabled={running}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value));
                setFocusMin(v);
                if (phase === "focus" && !running) setSecondsLeft(v * 60);
              }}
              className="w-14 rounded-lg border border-input bg-background px-2 py-1"
            />
            min
          </label>
          <label className="flex items-center gap-1">
            Break
            <input
              type="number"
              min={1}
              max={30}
              value={breakMin}
              disabled={running}
              onChange={(e) => setBreakMin(Math.max(1, Number(e.target.value)))}
              className="w-14 rounded-lg border border-input bg-background px-2 py-1"
            />
            min
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="mt-1 text-3xl font-semibold">{todayMin}<span className="text-base text-muted-foreground"> min</span></p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs text-muted-foreground">Last 7 days</p>
          <p className="mt-1 text-3xl font-semibold">{weekMin}<span className="text-base text-muted-foreground"> min</span></p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Weekly focus</h2>
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="day" stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} width={30} />
              <Tooltip />
              <Bar dataKey="minutes" fill="oklch(0.55 0.14 255)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
