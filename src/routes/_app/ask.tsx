import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Sparkles, Lightbulb } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSubjects } from "@/lib/firestore-hooks";
import { askExplainer } from "@/lib/explain.functions";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export const Route = createFileRoute("/_app/ask")({
  ssr: false,
  component: AskPage,
});

type ChatMessage = { role: "user" | "model"; text: string };

const STARTERS = [
  "Explain photosynthesis like I'm new to biology",
  "What's the difference between speed and velocity?",
  "Help me understand this question without solving it for me",
];

function AskPage() {
  const { user } = useAuth();
  const subjects = useSubjects(user?.uid);
  const [subjectId, setSubjectId] = useState<string>("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const askFn = useServerFn(askExplainer);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const subjectName = subjects?.find((s) => s.id === subjectId)?.subjectName ?? "";

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text: question }];
    setMessages(nextMessages);
    setBusy(true);
    try {
      const result = await askFn({
        data: {
          subjectName,
          question,
          history: nextMessages.slice(0, -1).slice(-12),
        },
      });
      setMessages((m) => [...m, { role: "model", text: result.reply }]);
    } catch (err) {
      toast.error((err as Error).message);
      setMessages((m) => m.slice(0, -1));
      setInput(question);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-semibold">
          <Lightbulb className="h-7 w-7 text-amber-500" /> Ask
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Explains and simplifies — never gives you the final answer to a graded question.
          Paste a tricky question and it'll walk you through how to think about it instead.
        </p>
      </div>

      {subjects && subjects.length > 0 && (
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="w-fit rounded-2xl border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">No specific subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.subjectName}
            </option>
          ))}
        </select>
      )}

      <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/50" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Ask about a concept you're stuck on, or paste a question you want explained (not solved).
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
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-muted"
                }`}
              >
                {m.text}
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
