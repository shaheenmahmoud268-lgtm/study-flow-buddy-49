import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Lightbulb, Plus, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/ask")({
  ssr: false,
  component: AskLayout,
});

export type AskThread = {
  id: string;
  title: string;
  updatedAt?: { seconds: number } | null;
};

function AskLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;
  const [threads, setThreads] = useState<AskThread[] | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "askThreads"), orderBy("updatedAt", "desc")),
      (snap) => {
        setThreads(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AskThread, "id">) })),
        );
      },
    );
    return unsub;
  }, [user]);

  const createThread = async () => {
    if (!user) return;
    const id = crypto.randomUUID();
    try {
      await setDoc(doc(db, "users", user.uid, "askThreads", id), {
        title: "New chat",
        messages: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      navigate({ to: "/ask/$threadId", params: { threadId: id } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeThread = async (id: string) => {
    if (!user) return;
    if (!confirm("Delete this conversation?")) return;
    await deleteDoc(doc(db, "users", user.uid, "askThreads", id));
    if (activeId === id) navigate({ to: "/ask" });
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-6xl gap-4 p-2 sm:p-4">
      <aside className="hidden md:flex w-64 flex-col rounded-2xl border border-border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 px-1">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <span className="font-semibold text-sm">Ask</span>
        </div>
        <button
          onClick={createThread}
          className="flex items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        <div className="mt-3 flex-1 overflow-y-auto space-y-1">
          {threads === null ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No conversations yet. Start a new chat.
            </p>
          ) : (
            threads.map((t) => {
              const active = t.id === activeId;
              return (
                <div
                  key={t.id}
                  className={`group flex items-center gap-1 rounded-xl pr-1 ${
                    active ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <Link
                    to="/ask/$threadId"
                    params={{ threadId: t.id }}
                    className="flex-1 flex items-center gap-2 rounded-xl px-2 py-2 text-xs truncate"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t.title || "Untitled"}</span>
                  </Link>
                  <button
                    onClick={() => removeThread(t.id)}
                    className="opacity-0 group-hover:opacity-100 rounded-lg p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar with thread picker */}
        <div className="md:hidden mb-2 flex items-center gap-2">
          <button
            onClick={createThread}
            className="flex items-center gap-1.5 rounded-2xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
          {threads && threads.length > 0 && (
            <select
              value={activeId ?? ""}
              onChange={(e) => {
                if (e.target.value)
                  navigate({ to: "/ask/$threadId", params: { threadId: e.target.value } });
              }}
              className="flex-1 rounded-2xl border border-input bg-background px-3 py-1.5 text-xs"
            >
              <option value="">Select a chat…</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title || "Untitled"}
                </option>
              ))}
            </select>
          )}
        </div>
        <Outlet />
      </div>
    </div>
  );
}
