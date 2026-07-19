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
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Bell, Crown, Zap, RotateCcw, UserPlus } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { EXAM_BOARDS } from "@/lib/igcse";
import { useSubjects, useAllTasks } from "@/lib/firestore-hooks";
import { todayISO } from "@/lib/dates";
import { createStudentAccount } from "@/lib/admin.functions";
import { useTheme, THEMES } from "@/lib/theme-context";

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
  const createAccount = useServerFn(createStudentAccount);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newBoard, setNewBoard] = useState<"Cambridge" | "Edexcel">("Cambridge");
  const [creatingAccount, setCreatingAccount] = useState(false);

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

  const createAccountForStudent = async () => {
    if (!newEmail || !newPassword || !newName) {
      toast.error("Fill in name, email and password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setCreatingAccount(true);
    try {
      const callerIdToken = await currentUser.getIdToken();
      const result = await createAccount({
        data: {
          callerIdToken,
          email: newEmail,
          password: newPassword,
          name: newName,
          examBoard: newBoard,
        },
      });
      toast.success(`Account created for ${result.email}`);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingAccount(false);
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

      <ThemePicker />

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

          <div className="mt-5 border-t border-amber-400/30 pt-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Create a student account</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Creates a real login (email + password) for another student. They can sign in with
              these credentials immediately.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Student name"
                className="rounded-2xl border border-input bg-background px-4 py-2 text-sm"
              />
              <select
                value={newBoard}
                onChange={(e) => setNewBoard(e.target.value as "Cambridge" | "Edexcel")}
                className="rounded-2xl border border-input bg-background px-4 py-2 text-sm"
              >
                {EXAM_BOARDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email"
                type="email"
                className="rounded-2xl border border-input bg-background px-4 py-2 text-sm"
              />
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password (min 6 chars)"
                type="password"
                className="rounded-2xl border border-input bg-background px-4 py-2 text-sm"
              />
            </div>
            <button
              disabled={creatingAccount}
              onClick={createAccountForStudent}
              className="mt-3 inline-flex items-center gap-1.5 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {creatingAccount ? "Creating…" : "Create account"}
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

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Theme</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick the look that feels right to you. Saved to your account, so it follows you across devices.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition-colors ${
              theme === t.id ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40"
            }`}
          >
            <span
              className="h-10 w-10 rounded-full border border-white/10"
              style={{
                background: `radial-gradient(circle at 35% 30%, ${t.swatch}, ${t.bg})`,
              }}
            />
            <span className="text-xs font-medium">{t.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
