import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useSubjects } from "@/lib/firestore-hooks";
import { addDaysISO, todayISO } from "@/lib/dates";

export const Route = createFileRoute("/_app/flashcards")({
  ssr: false,
  component: FlashcardsPage,
});

type Card = {
  id: string;
  subjectId: string;
  subjectName: string;
  question: string;
  answer: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewDate: string;
  lastReviewed: string | null;
};

function FlashcardsPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const subjects = useSubjects(uid);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [cards, setCards] = useState<Card[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [studying, setStudying] = useState(false);
  const [studyIdx, setStudyIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  useEffect(() => {
    if (!uid || !subjects) return;
    if (subjects.length && !selectedSubject) setSelectedSubject(subjects[0].id);
  }, [subjects, uid, selectedSubject]);

  useEffect(() => {
    if (!uid || !selectedSubject) return;
    const unsub = onSnapshot(
      collection(db, "users", uid, "subjects", selectedSubject, "flashcards"),
      (snap) => {
        const subj = subjects?.find((s) => s.id === selectedSubject);
        setCards(
          snap.docs.map((d) => {
            const data = d.data() as Partial<Card>;
            return {
              id: d.id,
              subjectId: selectedSubject,
              subjectName: subj?.subjectName ?? "",
              question: data.question ?? "",
              answer: data.answer ?? "",
              easeFactor: data.easeFactor ?? 2.5,
              intervalDays: data.intervalDays ?? 0,
              repetitions: data.repetitions ?? 0,
              nextReviewDate: data.nextReviewDate ?? todayISO(),
              lastReviewed: data.lastReviewed ?? null,
            };
          }),
        );
      },
    );
    return unsub;
  }, [uid, selectedSubject, subjects]);

  const today = todayISO();
  const dueCards = useMemo(
    () => (showAll ? cards : cards.filter((c) => c.nextReviewDate <= today)),
    [cards, showAll, today],
  );

  const addCard = async () => {
    if (!uid || !selectedSubject || !q || !a) return;
    await addDoc(collection(db, "users", uid, "subjects", selectedSubject, "flashcards"), {
      question: q,
      answer: a,
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      nextReviewDate: todayISO(),
      lastReviewed: null,
      createdAt: serverTimestamp(),
    });
    setQ("");
    setA("");
  };

  const grade = async (card: Card, quality: 0 | 3 | 4 | 5) => {
    if (!uid) return;
    // SM-2
    let { easeFactor, intervalDays, repetitions } = card;
    if (quality < 3) {
      repetitions = 0;
      intervalDays = 1;
    } else {
      repetitions += 1;
      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 6;
      else intervalDays = Math.round(intervalDays * easeFactor);
      easeFactor = Math.max(
        1.3,
        easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
      );
    }
    const nextReviewDate = addDaysISO(todayISO(), intervalDays);
    try {
      await updateDoc(doc(db, "users", uid, "subjects", card.subjectId, "flashcards", card.id), {
        easeFactor,
        intervalDays,
        repetitions,
        nextReviewDate,
        lastReviewed: todayISO(),
      });
      setRevealed(false);
      if (studyIdx + 1 >= dueCards.length) {
        setStudying(false);
        setStudyIdx(0);
        toast.success("Study session complete");
      } else {
        setStudyIdx((i) => i + 1);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (subjects && subjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Add a subject first to create flashcards.</p>
      </div>
    );
  }

  if (studying && dueCards.length > 0) {
    const card = dueCards[studyIdx];
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <div className="text-xs text-muted-foreground">
          Card {studyIdx + 1} of {dueCards.length}
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm min-h-64 flex flex-col justify-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Question</p>
          <p className="mt-2 text-xl">{card.question}</p>
          {revealed && (
            <>
              <hr className="my-6 border-border" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Answer</p>
              <p className="mt-2 text-xl">{card.answer}</p>
            </>
          )}
        </div>
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground"
          >
            Show answer
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Again", q: 0 as const, cls: "bg-destructive text-destructive-foreground" },
              { label: "Hard", q: 3 as const, cls: "bg-secondary text-secondary-foreground" },
              { label: "Good", q: 4 as const, cls: "bg-accent text-accent-foreground" },
              { label: "Easy", q: 5 as const, cls: "bg-primary text-primary-foreground" },
            ].map((b) => (
              <button
                key={b.label}
                onClick={() => grade(card, b.q)}
                className={`rounded-2xl py-3 text-sm font-medium ${b.cls}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => {
            setStudying(false);
            setRevealed(false);
            setStudyIdx(0);
          }}
          className="w-full text-xs text-muted-foreground hover:text-foreground"
        >
          Exit session
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Flashcards</h1>
        <div className="flex items-center gap-2">
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="rounded-2xl border border-input bg-background px-3 py-2 text-sm"
          >
            {subjects?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subjectName}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            All cards
          </label>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Add a card</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            placeholder="Question"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-2xl border border-input bg-background px-4 py-2 text-sm"
          />
          <input
            placeholder="Answer"
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="rounded-2xl border border-input bg-background px-4 py-2 text-sm"
          />
        </div>
        <button
          onClick={addCard}
          className="mt-3 inline-flex items-center gap-1 rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {dueCards.length} {showAll ? "cards" : "cards due"}
          </h2>
          {dueCards.length > 0 && (
            <button
              onClick={() => {
                setStudying(true);
                setStudyIdx(0);
                setRevealed(false);
              }}
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Start study
            </button>
          )}
        </div>
        <ul className="mt-4 space-y-2">
          {cards.length === 0 && <p className="text-sm text-muted-foreground">No cards yet.</p>}
          {cards.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-xl px-3 py-2 bg-background/60"
            >
              <span className="flex-1 text-sm">{c.question}</span>
              <span className="text-xs text-muted-foreground">next: {c.nextReviewDate}</span>
              <button
                onClick={async () => {
                  if (!uid) return;
                  await deleteDoc(
                    doc(db, "users", uid, "subjects", c.subjectId, "flashcards", c.id),
                  );
                }}
                className="p-1"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
