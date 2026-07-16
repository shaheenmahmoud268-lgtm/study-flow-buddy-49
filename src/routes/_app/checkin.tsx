import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { HeartPulse } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { todayISO } from "@/lib/dates";

export const Route = createFileRoute("/_app/checkin")({
  ssr: false,
  component: CheckinPage,
});

type Checkin = {
  date: string;
  mood: number;
  sleepHours: number;
  screenTimeHours: number;
  notes?: string;
};

const MOODS = ["😢", "😕", "😐", "🙂", "😄"];

function CheckinPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const today = todayISO();
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [mood, setMood] = useState(3);
  const [sleepHours, setSleepHours] = useState(8);
  const [screen, setScreen] = useState(3);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(db, "users", uid, "dailyCheckins"), (snap) => {
      const rows = snap.docs.map((d) => d.data() as Checkin);
      setCheckins(rows);
      const t = rows.find((r) => r.date === today);
      if (t) {
        setMood(t.mood);
        setSleepHours(t.sleepHours);
        setScreen(t.screenTimeHours);
        setNotes(t.notes ?? "");
      }
      setLoaded(true);
    });
    return unsub;
  }, [uid, today]);

  const save = async () => {
    if (!uid) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "users", uid, "dailyCheckins", today), {
        date: today,
        mood,
        sleepHours,
        screenTimeHours: screen,
        notes,
        createdAt: serverTimestamp(),
      });
      toast.success("Saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const chartData = useMemo(() => {
    const days: { day: string; mood: number | null; sleep: number | null }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const c = checkins.find((x) => x.date === iso);
      days.push({
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        mood: c?.mood ?? null,
        sleep: c?.sleepHours ?? null,
      });
    }
    return days;
  }, [checkins]);

  const lowMoodStreak = useMemo(() => {
    let count = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const c = checkins.find((x) => x.date === iso);
      if (c && c.mood <= 3) count++;
      else break;
    }
    return count;
  }, [checkins]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Daily check-in</h1>

      {lowMoodStreak >= 3 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <HeartPulse className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Thinking of you.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You've felt low for a few days. It might really help to share how you're doing with
                a parent, teacher, or another trusted adult — you don't have to go through this on
                your own.
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>

        <div className="mt-4">
          <label className="text-sm font-medium">How are you feeling?</label>
          <div className="mt-2 flex gap-2">
            {MOODS.map((emoji, i) => (
              <button
                key={i}
                onClick={() => setMood(i + 1)}
                className={`flex-1 rounded-2xl border py-3 text-2xl ${
                  mood === i + 1
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <label className="text-sm font-medium">Sleep: {sleepHours}h</label>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={sleepHours}
            onChange={(e) => setSleepHours(Number(e.target.value))}
            className="mt-2 w-full"
          />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">Screen time: {screen}h</label>
          <input
            type="range"
            min={0}
            max={16}
            step={0.5}
            value={screen}
            onChange={(e) => setScreen(Number(e.target.value))}
            className="mt-2 w-full"
          />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">Notes (optional)</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm"
          />
        </div>

        <button
          disabled={saving || !loaded}
          onClick={save}
          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save today's check-in"}
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Last 14 days</h2>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={30} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="mood" stroke="oklch(0.55 0.14 255)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="sleep" stroke="oklch(0.7 0.14 165)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
