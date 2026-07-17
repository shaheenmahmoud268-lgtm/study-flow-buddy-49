import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Layers,
  Timer,
  HeartPulse,
  Settings,
  LogOut,
  Sparkles,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase";
import { useAuth, FullPageSpinner } from "@/lib/auth-context";
import {
  IGCSE_SUBJECTS,
  EXAM_BOARDS,
  GRADES,
  EXAM_SESSIONS,
  sessionToISODate,
  sessionLabel,
  type ExamSession,
} from "@/lib/igcse";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

type UserDoc = {
  name?: string;
  examBoard?: string;
  onboardingComplete?: boolean;
  role?: "ceo" | "student";
};

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [docLoading, setDocLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setUserDoc(snap.exists() ? (snap.data() as UserDoc) : null);
      setDocLoading(false);
    });
    return unsub;
  }, [user]);

  if (loading || !user || docLoading) return <FullPageSpinner />;

  if (!userDoc?.onboardingComplete) {
    return <Onboarding uid={user.uid} />;
  }

  return <Shell name={userDoc.name ?? "there"} role={userDoc.role} />;
}

function Shell({ name, role }: { name: string; role?: "ceo" | "student" }) {
  const isCeo = role === "ceo";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const nav = [
    { to: "/dashboard", label: "Home", icon: LayoutDashboard },
    { to: "/subjects", label: "Subjects", icon: BookOpen },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/flashcards", label: "Cards", icon: Layers },
    { to: "/focus", label: "Focus", icon: Timer },
    { to: "/checkin", label: "Check-in", icon: HeartPulse },
    { to: "/settings", label: "Settings", icon: Settings },
  ] as const;

  const handleSignOut = async () => {
    await signOut(auth);
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0 lg:pl-64">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-border bg-sidebar px-4 py-6">
        <div className="flex items-center gap-2 px-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="font-semibold">StudyFlow</span>
        </div>
        <p className="mt-1 px-2 text-xs text-muted-foreground truncate flex items-center gap-1">
          Hi, {name}
          {isCeo && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
              <Crown className="h-3 w-3" /> CEO
            </span>
          )}
        </p>
        <nav className="mt-8 flex-1 space-y-1">
          {nav.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${
                  active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handleSignOut}
          className="mt-4 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      {/* Bottom nav (mobile) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur px-2 py-2">
        <div className="mx-auto flex max-w-md justify-between gap-1">
          {nav.slice(0, 6).map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <n.icon className="h-5 w-5" />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}

function Onboarding({ uid }: { uid: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [examBoard, setExamBoard] = useState<string>("Cambridge");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [examSessions, setExamSessions] = useState<
    Record<string, { session: ExamSession; year: number }>
  >({});
  const [targetGrades, setTargetGrades] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const currentYear = new Date().getFullYear();

  const setSubjectSession = (s: string, patch: Partial<{ session: ExamSession; year: number }>) => {
    setExamSessions((cur) => ({
      ...cur,
      [s]: {
        session: cur[s]?.session ?? "May/June",
        year: cur[s]?.year ?? currentYear,
        ...patch,
      },
    }));
  };

  const toggleSubject = (s: string) => {
    setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  };

  const finish = async () => {
    setBusy(true);
    try {
      await setDoc(
        doc(db, "users", uid),
        {
          name,
          examBoard,
          onboardingComplete: true,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      // Create subject docs
      const subCol = collection(db, "users", uid, "subjects");
      await Promise.all(
        subjects.map((s) =>
          addDoc(subCol, {
            subjectName: s,
            examDate: examSessions[s]
              ? sessionToISODate(examSessions[s].session, examSessions[s].year)
              : "",
            examSession: examSessions[s]
              ? sessionLabel(examSessions[s].session, examSessions[s].year)
              : "",
            targetGrade: targetGrades[s] ?? "",
            createdAt: serverTimestamp(),
          }),
        ),
      );
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="font-semibold">Let's set you up</span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
          <p className="text-xs text-muted-foreground">Step {step + 1} of 3</p>

          {step === 0 && (
            <>
              <h1 className="mt-1 text-2xl font-semibold">What should we call you?</h1>
              <p className="mt-1 text-sm text-muted-foreground">And which exam board are you on?</p>
              <input
                autoFocus
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-6 w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {EXAM_BOARDS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setExamBoard(b)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
                      examBoard === b
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  disabled={!name.trim()}
                  onClick={() => setStep(1)}
                  className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="mt-1 text-2xl font-semibold">Pick your subjects</h1>
              <p className="mt-1 text-sm text-muted-foreground">Choose the ones you're studying.</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-auto">
                {IGCSE_SUBJECTS.map((s) => {
                  const on = subjects.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSubject(s)}
                      className={`rounded-2xl border px-3 py-2 text-xs sm:text-sm ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(0)}
                  className="rounded-2xl border border-border px-5 py-2.5 text-sm"
                >
                  Back
                </button>
                <button
                  disabled={subjects.length === 0}
                  onClick={() => setStep(2)}
                  className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="mt-1 text-2xl font-semibold">Exam dates & goals</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Set exam date and target grade per subject.
              </p>
              <div className="mt-4 space-y-2 max-h-96 overflow-auto">
                {subjects.map((s) => (
                  <div
                    key={s}
                    className="rounded-2xl border border-border bg-background/60 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                  >
                    <div className="flex-1 text-sm font-medium">{s}</div>
                    <select
                      value={examSessions[s]?.session ?? "May/June"}
                      onChange={(e) =>
                        setSubjectSession(s, { session: e.target.value as ExamSession })
                      }
                      className="rounded-xl border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      {EXAM_SESSIONS.map((sess) => (
                        <option key={sess} value={sess}>
                          {sess}
                        </option>
                      ))}
                    </select>
                    <select
                      value={examSessions[s]?.year ?? currentYear}
                      onChange={(e) => setSubjectSession(s, { year: parseInt(e.target.value, 10) })}
                      className="rounded-xl border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      {Array.from({ length: 5 }, (_, i) => currentYear + i).map((y) => (
                        <option key={y} value={y}>
                          '{String(y).slice(-2)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={targetGrades[s] ?? ""}
                      onChange={(e) => setTargetGrades((cur) => ({ ...cur, [s]: e.target.value }))}
                      className="rounded-xl border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="">Target</option>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="rounded-2xl border border-border px-5 py-2.5 text-sm"
                >
                  Back
                </button>
                <button
                  disabled={busy}
                  onClick={finish}
                  className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Finish"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
