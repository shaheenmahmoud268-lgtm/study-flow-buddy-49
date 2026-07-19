import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useSubjects, useAllTasks, type Task } from "@/lib/firestore-hooks";
import { addDaysISO, daysUntil, toISO, todayISO } from "@/lib/dates";

export const Route = createFileRoute("/_app/calendar")({
  ssr: false,
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const subjects = useSubjects(uid);
  const tasks = useAllTasks(uid, subjects);
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => {
    const arr: Date[] = [];
    if (view === "week") {
      const start = new Date(anchor);
      start.setDate(start.getDate() - start.getDay());
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        arr.push(d);
      }
    } else {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      const from = new Date(start);
      from.setDate(from.getDate() - from.getDay());
      for (let d = new Date(from); d <= end || d.getDay() !== 0; d.setDate(d.getDate() + 1)) {
        arr.push(new Date(d));
        if (arr.length > 42) break;
      }
    }
    return arr;
  }, [view, anchor]);

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    (tasks ?? []).forEach((t) => {
      const list = m.get(t.dueDate) ?? [];
      list.push(t);
      m.set(t.dueDate, list);
    });
    return m;
  }, [tasks]);

  const handleDragEnd = async (e: DragEndEvent) => {
    if (!uid || !e.over) return;
    const t = e.active.data.current as Task;
    const newDate = e.over.id as string;
    if (t.dueDate === newDate) return;
    try {
      await updateDoc(doc(db, "users", uid, "subjects", t.subjectId, "tasks", t.id), {
        dueDate: newDate,
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const autoGenerate = async () => {
    if (!uid || !subjects || !tasks) return;
    setBusy(true);
    try {
      // For each subject: figure out days until exam and current readiness.
      // Distribute (missingRevisionTasks) evenly. We generate a target of
      // one revision task per day-of-remaining unless subject already has
      // that many revision tasks. Prioritise subjects with closer exam &
      // lower readiness by adjusting target proportionally.
      const today = todayISO();
      const plans = subjects
        .filter((s) => s.examDate && daysUntil(s.examDate) > 0)
        .map((s) => {
          const daysLeft = daysUntil(s.examDate);
          const rev = tasks.filter((t) => t.subjectId === s.id && t.type === "revision");
          const done = rev.filter((t) => t.isComplete && t.dueDate <= today).length;
          const total = rev.filter((t) => t.dueDate <= today).length;
          const readiness = total === 0 ? 0 : done / total;
          // Weight: closer exam + lower readiness -> more sessions
          const weight = (1 - readiness) * (1 + Math.max(0, 1 - daysLeft / 60));
          const sessions = Math.max(3, Math.round(Math.min(daysLeft, 20) * (0.5 + weight)));
          return { s, daysLeft, sessions };
        });

      // Distribute each subject's sessions evenly across daysLeft
      const writes: Promise<unknown>[] = [];
      for (const p of plans) {
        const step = Math.max(1, Math.floor(p.daysLeft / p.sessions));
        for (let i = 0; i < p.sessions; i++) {
          const dayOffset = Math.min(p.daysLeft - 1, i * step + 1);
          const due = addDaysISO(today, dayOffset);
          writes.push(
            addDoc(collection(db, "users", uid, "subjects", p.s.id, "tasks"), {
              title: `Revise ${p.s.subjectName}`,
              type: "revision",
              dueDate: due,
              isComplete: false,
              createdAt: serverTimestamp(),
            }),
          );
        }
      }
      await Promise.all(writes);
      toast.success(`Generated ${writes.length} revision sessions`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Calendar</h1>
        <div className="flex gap-2">
          <div className="inline-flex rounded-2xl border border-border p-0.5">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs rounded-xl ${
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            disabled={busy}
            onClick={autoGenerate}
            className="rounded-2xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Planning…" : "Auto-generate"}
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between text-sm">
        <button
          onClick={() => {
            const d = new Date(anchor);
            view === "week" ? d.setDate(d.getDate() - 7) : d.setMonth(d.getMonth() - 1);
            setAnchor(d);
          }}
          className="rounded-xl border border-border px-3 py-1"
        >
          ←
        </button>
        <span className="font-medium">
          {anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => {
            const d = new Date(anchor);
            view === "week" ? d.setDate(d.getDate() + 7) : d.setMonth(d.getMonth() + 1);
            setAnchor(d);
          }}
          className="rounded-xl border border-border px-3 py-1"
        >
          →
        </button>
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className={view === "month" ? "overflow-x-auto -mx-1 px-1" : ""}>
          <div
            className={`grid gap-1.5 sm:gap-2 ${
              view === "week"
                ? "grid-cols-1 sm:grid-cols-7"
                : "grid-cols-7 min-w-[560px] sm:min-w-0"
            }`}
          >
            {days.map((d) => {
              const iso = toISO(d);
              const list = byDate.get(iso) ?? [];
              const isToday = iso === todayISO();
              return (
                <Droppable key={iso} id={iso}>
                  <div
                    className={`min-h-20 sm:min-h-24 h-full rounded-2xl border p-1.5 sm:p-2 ${
                      isToday ? "border-primary bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <div className="text-[10px] sm:text-xs text-muted-foreground">
                      {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                    </div>
                    <div className="mt-1 space-y-1">
                      {list.map((t) => (
                        <DraggableTask key={t.id} task={t} />
                      ))}
                    </div>
                  </div>
                </Droppable>
              );
            })}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function Droppable({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={isOver ? "ring-2 ring-primary rounded-2xl" : ""}>
      {children}
    </div>
  );
}

function DraggableTask({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: task,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={`cursor-grab whitespace-normal break-words rounded-lg px-2 py-1 text-[11px] leading-snug ${
        task.type === "revision"
          ? "bg-accent text-accent-foreground"
          : "bg-secondary text-secondary-foreground"
      } ${task.isComplete ? "line-through opacity-60" : ""}`}
      title={`${task.subjectName} · ${task.title}`}
    >
      {task.title}
    </div>
  );
}
