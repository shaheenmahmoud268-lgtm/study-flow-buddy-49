import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Circle, BookOpen, FileText, Video, ExternalLink } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Task } from "@/lib/firestore-hooks";
import { todayISO } from "@/lib/dates";
import { getSubjectResources, type ResourceLink } from "@/lib/resources";

export const Route = createFileRoute("/_app/subjects/$subjectId")({
  ssr: false,
  component: SubjectDetail,
});

type Card = {
  id: string;
  question: string;
  answer: string;
  nextReviewDate?: string;
};

function SubjectDetail() {
  const { subjectId } = Route.useParams();
  const { user } = useAuth();
  const uid = user?.uid;
  const [subject, setSubject] = useState<{
    subjectName: string;
    examBoard?: string;
    level?: string;
  } | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskType, setNewTaskType] = useState<"homework" | "revision">("homework");
  const [newTaskDate, setNewTaskDate] = useState(todayISO());

  useEffect(() => {
    if (!uid) return;
    const u1 = onSnapshot(doc(db, "users", uid, "subjects", subjectId), (snap) => {
      setSubject(
        snap.exists()
          ? (snap.data() as { subjectName: string; examBoard?: string; level?: string })
          : null,
      );
    });
    const u2 = onSnapshot(
      collection(db, "users", uid, "subjects", subjectId, "tasks"),
      (snap) => {
        setTasks(
          snap.docs.map((d) => ({
            id: d.id,
            subjectId,
            subjectName: subject?.subjectName ?? "",
            ...(d.data() as Omit<Task, "id" | "subjectId" | "subjectName">),
          }))
        );
      }
    );
    const u3 = onSnapshot(
      collection(db, "users", uid, "subjects", subjectId, "flashcards"),
      (snap) => {
        setCards(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Card, "id">) })));
      }
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [uid, subjectId, subject?.subjectName]);

  const addTask = async () => {
    if (!uid || !newTaskTitle) return;
    await addDoc(collection(db, "users", uid, "subjects", subjectId, "tasks"), {
      title: newTaskTitle,
      type: newTaskType,
      dueDate: newTaskDate,
      isComplete: false,
      createdAt: serverTimestamp(),
    });
    setNewTaskTitle("");
  };

  const toggleTask = async (t: Task) => {
    if (!uid) return;
    await updateDoc(doc(db, "users", uid, "subjects", subjectId, "tasks", t.id), {
      isComplete: !t.isComplete,
      completedAt: !t.isComplete ? new Date().toISOString() : null,
    });
  };

  return (
    <div className="space-y-6">
      <Link to="/subjects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="text-3xl font-semibold">{subject?.subjectName ?? "Loading…"}</h1>

      {subject && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Resources</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Syllabus, past papers and revision videos to help you hit your target grade.
          </p>
          {(() => {
            const { syllabus, pastPapers, videos } = getSubjectResources({
              subjectName: subject.subjectName,
              examBoard: subject.examBoard,
              level: subject.level,
            });
            return (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <ResourceGroup icon={<BookOpen className="h-4 w-4" />} title="Syllabus" links={syllabus} />
                <ResourceGroup icon={<FileText className="h-4 w-4" />} title="Past papers" links={pastPapers} />
                <ResourceGroup icon={<Video className="h-4 w-4" />} title="Videos" links={videos} />
              </div>
            );
          })()}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Tasks</h2>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            placeholder="New task"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            className="flex-1 rounded-2xl border border-input bg-background px-4 py-2 text-sm"
          />
          <select
            value={newTaskType}
            onChange={(e) => setNewTaskType(e.target.value as "homework" | "revision")}
            className="rounded-2xl border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="homework">Homework</option>
            <option value="revision">Revision</option>
          </select>
          <input
            type="date"
            value={newTaskDate}
            onChange={(e) => setNewTaskDate(e.target.value)}
            className="rounded-2xl border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={addTask}
            className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4 inline" /> Add
          </button>
        </div>
        <ul className="mt-4 space-y-1">
          {!tasks ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            tasks
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-muted">
                  <button onClick={() => toggleTask(t)}>
                    {t.isComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <span className={`flex-1 text-sm ${t.isComplete ? "line-through text-muted-foreground" : ""}`}>
                    {t.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.type} · {t.dueDate}
                  </span>
                  <button
                    onClick={async () => {
                      if (!uid) return;
                      await deleteDoc(doc(db, "users", uid, "subjects", subjectId, "tasks", t.id));
                    }}
                    className="p-1"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Flashcards</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {cards?.length ?? 0} cards ·{" "}
          <Link to="/flashcards" className="text-primary hover:underline">Study →</Link>
        </p>
      </section>
    </div>
  );
}

function ResourceGroup({
  icon,
  title,
  links,
}: {
  icon: ReactNode;
  title: string;
  links: ResourceLink[];
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {icon} {title}
      </div>
      <ul className="mt-2 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-1 text-xs text-primary hover:underline"
            >
              <span className="flex-1">{l.label}</span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
            </a>
            <p className="text-[11px] text-muted-foreground">{l.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
