import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { LogOut, Bell, Crown, Zap, RotateCcw } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { EXAM_BOARDS } from "@/lib/igcse";
import { useSubjects, useAllTasks } from "@/lib/firestore-hooks";
import { todayISO } from "@/lib/dates";

export const Route = createFileRoute("/_app/settings")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const navigate = useNavigate();
  const subjects = useSubjects(uid);
  const tasks = useAllTasks(uid, subjects);
  const [name, setName] = useState("");
  const [examBoard, setExamBoard] = useState("Cambridge");
  const [notif, setNotif] = useState(true);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"ceo" | "student" | undefined>(undefined);
  const [ceoBusy, setCeoBusy] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      const d = snap.data();
      if (d) {
        setName(d.name ?? "");
        setExamBoard(d.examBoard ?? "Cambridge");
        setRole(d.role);
        if (typeof d.notificationsEnabled === "boolean") setNotif(d.notificationsEnabled);
      }
    });
    return unsub;
  }, [uid]);

  const isCeo = role === "ceo";

  const completeAllToday = async () => {
    if (!uid || !tasks) return;
    setCeoBusy(true);
    try {
      const today = todayISO();
      const due = tasks.filter((t) => t.dueDate <= today && !t.isComplete);
      const batch = writeBatch(db);
      due.forEach((t) => {
        batch.update(doc(db, "users", uid, "subjects", t.subjectId, "tasks", t.id), {
          isComplete: true,
          completedAt: new Date().toISOString(),
        });
      });
      await batch.commit();
      toast.success(`Completed ${due.length} task(s) instantly`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCeoBusy(false);
    }
  };

  const instantFocusSession = async () => {
    if (!uid || !subjects?.length) {
      toast.error("Add a subject first");
      return;
    }
    setCeoBusy(true);
    try {
      const subj = subjects[0];
      await addDoc(collection(db, "users", uid, "focusSessions"), {
        subjectId: subj.id,
        subjectName: subj.subjectName,
        durationMinutes: 25,
        completedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      toast.success("Logged an instant 25-min focus session");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCeoBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "users", uid), {
        name,
        examBoard,
        notificationsEnabled: notif,
      });
      toast.success("Saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateSubject = async (id: string, field: string, value: string) => {
    if (!uid) return;
    await updateDoc(doc(db, "users", uid, "subjects", id), { [field]: value });
  };

  const logout = async () => {
    await signOut(auth);
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Settings</h1>

      {isCeo && (
        <section className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Elite CEO controls</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Instant actions available only to your account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={ceoBusy}
              onClick={completeAllToday}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" /> Complete all of today's tasks
            </button>
            <button
              disabled={ceoBusy}
              onClick={instantFocusSession}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-400/50 px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-400/10 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Log instant focus session
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Exam board</label>
            <select
              value={examBoard}
              onChange={(e) => setExamBoard(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm"
            >
              {EXAM_BOARDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <input type="checkbox" checked={notif} onChange={(e) => setNotif(e.target.checked)} />
            Enable notifications (coming soon)
          </label>
        </div>
        <button
          disabled={busy}
          onClick={saveProfile}
          className="mt-4 rounded-2xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Subjects & targets</h2>
        {!subjects ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : subjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No subjects added yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {subjects.map((s) => (
              <li
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl bg-background/60 p-3"
              >
                <div className="flex-1 text-sm font-medium">{s.subjectName}</div>
                <input
                  type="date"
                  defaultValue={s.examDate}
                  onBlur={(e) => updateSubject(s.id, "examDate", e.target.value)}
                  className="rounded-xl border border-input bg-background px-3 py-1.5 text-sm"
                />
                <input
                  defaultValue={s.targetGrade}
                  placeholder="Target"
                  onBlur={(e) => updateSubject(s.id, "targetGrade", e.target.value)}
                  className="w-24 rounded-xl border border-input bg-background px-3 py-1.5 text-sm"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        onClick={logout}
        className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-2 text-sm hover:bg-muted"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
