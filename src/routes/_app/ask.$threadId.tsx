import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Send, Sparkles } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useSubjects } from "@/lib/firestore-hooks";
import { askExplainer } from "@/lib/explain.functions";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export const Route = createFileRoute("/_app/ask/$threadId")({
  ssr: false,
  component: AskThreadPage,
});

type ChatMessage = { role: "user" | "model"; text: string };

const STARTERS = [
  "Explain photosynthesis like I'm new to biology",
  "What's the difference between speed and velocity?",
  "Help me understand this question without solving it for me",
];

function AskThreadPage() {
  const { threadId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const subjects = useSubjects(user?.uid);
  const [subjectId, setSubjectId] = useState<string>("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState("New chat");
  const [threadMissing, setThreadMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const askFn = useServerFn(askExplainer);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to this thread's document.
  useEffect(() => {
    if (!user) return;
    setMessages([]);
    setThreadMissing(false);
    const unsub = onSnapshot(doc(db, "users", user.uid, "askThreads", threadId), (snap) => {
      if (!snap.exists()) {
        setThreadMissing(true);
        return;
      }
      const data = snap.data() as { messages?: ChatMessage[]; title?: string };
      setMessages(data.messages ?? []);
      setTitle(data.title ?? "New chat");
    });
    return unsub;
  }, [user, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    if (threadMissing) navigate({ to: "/ask", replace: true });
  }, [threadMissing, navigate]);

  const subjectName = subjects?.find((s) => s.id === subjectId)?.subjectName ?? "";

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy || !user) return;
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text: question }];
    setMessages(nextMessages);
    setBusy(true);
    const isFirst = messages.length === 0;
    const newTitle = isFirst ? question.slice(0, 60) : title;
    // Persist the user turn immediately so it survives reload.
    try {
      await updateDoc(doc(db, "users", user.uid, "askThreads", threadId), {
        messages: nextMessages,
        title: newTitle,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
    try {
      const result = await askFn({
        data: {
          subjectName,
          question,
          history: nextMessages.slice(0, -1).slice(-12),
        },
      });
      const finalMessages: ChatMessage[] = [...nextMessages, { role: "model", text: result.reply }];
      setMessages(finalMessages);
      await updateDoc(doc(db, "users", user.uid, "askThreads", threadId), {
        messages: finalMessages,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      toast.error((err as Error).message);
      setMessages((m) => m.slice(0, -1));
      setInput(question);
      await updateDoc(doc(db, "users", user.uid, "askThreads", threadId), {
        messages: nextMessages.slice(0, -1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {subjects && subjects.length > 0 && (
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="rounded-2xl border border-input bg-background px-3 py-1.5 text-xs"
          >
            <option value="">No subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subjectName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/50" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Ask about a concept you're stuck on, or paste a question you want explained (not
              solved).
            </p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-4 py-2 text-xs hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "ml-auto whitespace-pre-wrap bg-primary text-primary-foreground"
                    : "mr-auto bg-muted"
                }`}
              >
                {m.role === "user" ? (
                  m.text
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:mt-3 prose-headings:mb-2 prose-pre:my-2">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {m.text}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="mr-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a concept or paste a question…"
          className="flex-1 rounded-2xl border border-input bg-background px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
