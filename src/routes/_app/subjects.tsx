import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Pencil, Plus, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useSubjects, type Subject } from "@/lib/firestore-hooks";
import { daysUntil } from "@/lib/dates";
import {
  GRADES,
  IGCSE_SUBJECTS,
  EXAM_BOARDS,
  EXAM_SESSIONS,
  sessionToISODate,
  sessionLabel,
  parseSessionLabel,
  type ExamSession,
} from "@/lib/igcse";

export const Route = createFileRoute("/_app/subjects")({
  ssr: false,
  component: SubjectsPage,
});

function SubjectsPage() {
  const { user } = useAuth();
  const subjects = useSubjects(user?.uid);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Subjects</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subjects?.length ?? 0} tracked</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </header>

      {!subjects ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : subjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No subjects added yet — let's add your first one.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {subjects.map((s) => {
            const days = s.examDate ? daysUntil(s.examDate) : null;
            return (
              <li key={s.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{s.subjectName}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.examBoard ? `${s.examBoard} · ` : ""}
                      Target {s.targetGrade || "—"} · Exam{" "}
                      {s.examSession || s.examDate || "not set"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(s)}
                      className="rounded-lg p-1.5 hover:bg-muted"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!user) return;
                        if (!confirm(`Delete ${s.subjectName}?`)) return;
                        await deleteDoc(doc(db, "users", user.uid, "subjects", s.id));
                      }}
                      className="rounded-lg p-1.5 hover:bg-muted"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {days !== null && (
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        days < 0
                          ? "bg-muted text-muted-foreground"
                          : days < 30
                            ? "bg-destructive/10 text-destructive"
                            : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {days < 0 ? "past" : `${days} days`}
                    </span>
                  )}
                  <Link
                    to="/subjects/$subjectId"
                    params={{ subjectId: s.id }}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Open <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(creating || editing) && (
        <SubjectDialog
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SubjectDialog({ initial, onClose }: { initial?: Subject; onClose: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(initial?.subjectName ?? "");
  const currentYear = new Date().getFullYear();
  const parsedInitial = initial?.examSession ? parseSessionLabel(initial.examSession) : null;
  const [session, setSession] = useState<ExamSession>(parsedInitial?.session ?? "May/June");
  const [year, setYear] = useState<number>(parsedInitial?.year ?? currentYear);
  const [targetGrade, setTargetGrade] = useState(initial?.targetGrade ?? "");
  const [examBoard, setExamBoard] = useState(initial?.examBoard ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial?.examBoard || !user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const accountBoard = snap.data()?.examBoard;
      if (accountBoard) setExamBoard((prev) => prev || accountBoard);
    });
    return unsub;
  }, [user, initial?.examBoard]);

  const save = async () => {
    if (!user || !name) return;
    setBusy(true);
    try {
      if (initial) {
        await updateDoc(doc(db, "users", user.uid, "subjects", initial.id), {
          subjectName: name,
          examDate: sessionToISODate(session, year),
          examSession: sessionLabel(session, year),
          targetGrade,
          examBoard,
        });
      } else {
        await addDoc(collection(db, "users", user.uid, "subjects"), {
          subjectName: name,
          examDate: sessionToISODate(session, year),
          examSession: sessionLabel(session, year),
          targetGrade,
          examBoard,
          createdAt: serverTimestamp(),
        });
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold">{initial ? "Edit subject" : "New subject"}</h2>
        <div className="mt-4 space-y-3">
          <input
            list="subject-list"
            placeholder="Subject name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm"
          />
          <datalist id="subject-list">
            {IGCSE_SUBJECTS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <select
            value={examBoard}
            onChange={(e) => setExamBoard(e.target.value)}
            className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm"
          >
            <option value="">Exam board (defaults to account board)</option>
            {EXAM_BOARDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={session}
              onChange={(e) => setSession(e.target.value as ExamSession)}
              className="flex-1 rounded-2xl border border-input bg-background px-4 py-2.5 text-sm"
            >
              {EXAM_SESSIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="w-24 rounded-2xl border border-input bg-background px-4 py-2.5 text-sm"
            >
              {Array.from({ length: 5 }, (_, i) => currentYear + i).map((y) => (
                <option key={y} value={y}>
                  '{String(y).slice(-2)}
                </option>
              ))}
            </select>
          </div>
          <select
            value={targetGrade}
            onChange={(e) => setTargetGrade(e.target.value)}
            className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm"
          >
            <option value="">Target grade</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-2xl border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            disabled={busy || !name}
            onClick={save}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
