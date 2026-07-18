import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Lightbulb, Plus, MessageSquare, Trash2, Pin, PinOff, Search, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/ask")({
  ssr: false,
  component: AskLayout,
});

type ChatMessage = { role: "user" | "model"; text: string };

export type AskThread = {
  id: string;
  title: string;
  pinned?: boolean;
  messages?: ChatMessage[];
  updatedAt?: { seconds: number } | null;
};

function AskLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;
  const [threads, setThreads] = useState<AskThread[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "askThreads"), orderBy("updatedAt", "desc")),
      (snap) => {
        setThreads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AskThread, "id">) })));
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
        pinned: false,
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

  const togglePin = async (t: AskThread) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "askThreads", t.id), {
      pinned: !t.pinned,
    });
  };

  // Search + pinned sort.
  const q = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (!threads) return { pinned: [], other: [], matches: new Map<string, string>() };
    const matches = new Map<string, string>(); // threadId -> matching snippet
    const filtered = threads.filter((t) => {
      if (!q) return true;
      if ((t.title ?? "").toLowerCase().includes(q)) {
        matches.set(t.id, t.title);
        return true;
      }
      const hit = (t.messages ?? []).find((m) => m.text.toLowerCase().includes(q));
      if (hit) {
        const idx = hit.text.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 20);
        matches.set(t.id, (start > 0 ? "…" : "") + hit.text.slice(start, idx + q.length + 40));
        return true;
      }
      return false;
    });
    const pinned = filtered.filter((t) => t.pinned);
    const other = filtered.filter((t) => !t.pinned);
    return { pinned, other, matches };
  }, [threads, q]);

  const renderRow = (t: AskThread) => {
    const active = t.id === activeId;
    const snippet = results.matches.get(t.id);
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
          className="flex-1 min-w-0 flex items-center gap-2 rounded-xl px-2 py-2 text-xs"
        >
          {t.pinned ? (
            <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500 fill-amber-500" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="flex-1 min-w-0">
            <span className="block truncate">{t.title || "Untitled"}</span>
            {q && snippet && snippet !== t.title && (
              <span className="block truncate text-[10px] text-muted-foreground">{snippet}</span>
            )}
          </span>
        </Link>
        <button
          onClick={() => togglePin(t)}
          className="opacity-0 group-hover:opacity-100 rounded-lg p-1 text-muted-foreground hover:text-amber-500"
          aria-label={t.pinned ? "Unpin conversation" : "Pin conversation"}
          title={t.pinned ? "Unpin" : "Pin"}
        >
          {t.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => removeThread(t.id)}
          className="opacity-0 group-hover:opacity-100 rounded-lg p-1 text-muted-foreground hover:text-destructive"
          aria-label="Delete conversation"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] sm:h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] max-w-6xl gap-4 p-2 sm:p-4">
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
        <div className="mt-3 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats & messages"
            className="w-full rounded-2xl border border-input bg-background pl-8 pr-7 py-1.5 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-3 flex-1 overflow-y-auto space-y-1">
          {threads === null ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No conversations yet. Start a new chat.
            </p>
          ) : results.pinned.length === 0 && results.other.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">No chats match “{search}”.</p>
          ) : (
            <>
              {results.pinned.length > 0 && (
                <>
                  <p className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Pinned
                  </p>
                  {results.pinned.map(renderRow)}
                </>
              )}
              {results.other.length > 0 && (
                <>
                  {results.pinned.length > 0 && (
                    <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Recent
                    </p>
                  )}
                  {results.other.map(renderRow)}
                </>
              )}
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden mb-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={createThread}
              className="flex items-center gap-1.5 rounded-2xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                className="w-full rounded-2xl border border-input bg-background pl-8 pr-3 py-1.5 text-xs"
              />
            </div>
          </div>
          {threads && threads.length > 0 && (
            <select
              value={activeId ?? ""}
              onChange={(e) => {
                if (e.target.value)
                  navigate({ to: "/ask/$threadId", params: { threadId: e.target.value } });
              }}
              className="w-full rounded-2xl border border-input bg-background px-3 py-1.5 text-xs"
            >
              <option value="">Select a chat…</option>
              {[...results.pinned, ...results.other].map((t) => (
                <option key={t.id} value={t.id}>
                  {t.pinned ? "📌 " : ""}
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
