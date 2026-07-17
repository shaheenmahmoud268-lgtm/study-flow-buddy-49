import { collection, onSnapshot, query, type QuerySnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

export type Subject = {
  id: string;
  subjectName: string;
  examDate: string;
  examSession?: string;
  targetGrade: string;
  examBoard?: string;
};

export type Task = {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  type: "homework" | "revision";
  dueDate: string;
  isComplete: boolean;
  completedAt?: string | null;
};

export function useSubjects(uid: string | undefined) {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(db, "users", uid, "subjects"), (snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, "id">) })));
    });
    return unsub;
  }, [uid]);
  return subjects;
}

export function useAllTasks(uid: string | undefined, subjects: Subject[] | null) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  useEffect(() => {
    if (!uid || !subjects) return;
    if (subjects.length === 0) {
      setTasks([]);
      return;
    }
    const perSubject = new Map<string, Task[]>();
    const unsubs = subjects.map((s) => {
      return onSnapshot(
        query(collection(db, "users", uid, "subjects", s.id, "tasks")),
        (snap: QuerySnapshot) => {
          perSubject.set(
            s.id,
            snap.docs.map((d) => ({
              id: d.id,
              subjectId: s.id,
              subjectName: s.subjectName,
              ...(d.data() as Omit<Task, "id" | "subjectId" | "subjectName">),
            })),
          );
          const merged: Task[] = [];
          perSubject.forEach((arr) => merged.push(...arr));
          setTasks(merged);
        },
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [uid, subjects]);
  return tasks;
}
