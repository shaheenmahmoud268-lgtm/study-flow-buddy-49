import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import {
  Send,
  Sparkles,
  Pencil,
  Check,
  Download,
  Mic,
  MicOff,
  Paperclip,
  X,
  FileText,
} from "lucide-react";
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

type ChatMessage = {
  role: "user" | "model";
  text: string;
  imageDataUrl?: string;
  attachmentName?: string;
};

type Attachment =
  | { kind: "image"; name: string; dataUrl: string }
  | { kind: "text"; name: string; content: string };

// Minimal shape of the (non-standard, webkit-prefixed) SpeechRecognition API
// we actually use — avoids depending on lib.dom types that may not include it.
type MinimalSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);

  useEffect(() => {
    setVoiceSupported(
      typeof window !== "undefined" &&
        ("webkitSpeechRecognition" in window || "SpeechRecognition" in window),
    );
  }, []);

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
    if ((!question && !attachment) || busy || !user) return;
    setInput("");
    const pendingAttachment = attachment;
    setAttachment(null);
    const userMessage: ChatMessage = {
      role: "user",
      text: question || (pendingAttachment ? `[Attached: ${pendingAttachment.name}]` : ""),
      ...(pendingAttachment?.kind === "image"
        ? { imageDataUrl: pendingAttachment.dataUrl, attachmentName: pendingAttachment.name }
        : {}),
      ...(pendingAttachment?.kind === "text" ? { attachmentName: pendingAttachment.name } : {}),
    };
    const nextMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    setBusy(true);
    const isFirst = messages.length === 0;
    const newTitle = isFirst
      ? (question || pendingAttachment?.name || "New chat").slice(0, 60)
      : title;
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
          question: question || "Please look at the attached content.",
          history: nextMessages
            .slice(0, -1)
            .slice(-12)
            .map(({ role, text: t }) => ({ role, text: t })),
          ...(pendingAttachment?.kind === "image"
            ? { imageDataUrl: pendingAttachment.dataUrl }
            : {}),
          ...(pendingAttachment?.kind === "text"
            ? { attachedText: pendingAttachment.content }
            : {}),
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
      setAttachment(pendingAttachment);
      await updateDoc(doc(db, "users", user.uid, "askThreads", threadId), {
        messages: nextMessages.slice(0, -1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  // ---- Title editing ----
  const startEditTitle = () => {
    setTitleDraft(title);
    setEditingTitle(true);
  };

  const saveTitle = async () => {
    if (!user) return;
    const next = titleDraft.trim() || "Untitled";
    setEditingTitle(false);
    setTitle(next);
    try {
      await updateDoc(doc(db, "users", user.uid, "askThreads", threadId), { title: next });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ---- Export chat ----
  const exportChat = () => {
    const lines = [
      `# ${title}`,
      "",
      ...messages.map((m) =>
        m.role === "user"
          ? `**You:** ${m.text}${m.attachmentName ? ` _(attached: ${m.attachmentName})_` : ""}`
          : `**Explainer:** ${m.text}`,
      ),
    ];
    const blob = new Blob([lines.join("\n\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "chat").replace(/[^\w\- ]/g, "").slice(0, 60) || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Voice input ----
  const toggleRecording = () => {
    if (!voiceSupported) {
      toast.error("Voice input isn't supported in this browser.");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor =
      (window as unknown as { webkitSpeechRecognition?: new () => MinimalSpeechRecognition })
        .webkitSpeechRecognition ??
      (window as unknown as { SpeechRecognition?: new () => MinimalSpeechRecognition })
        .SpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  // ---- File / photo attachment ----
  const onFileSelected = (file: File) => {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          const maxDim = 800;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
          setAttachment({ kind: "image", name: file.name, dataUrl });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachment({
          kind: "text",
          name: file.name,
          content: String(reader.result).slice(0, 8000),
        });
      };
      reader.readAsText(file);
    } else {
      toast.error("Only images and text files (.txt, .md) are supported for now.");
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between gap-3">
        {editingTitle ? (
          <div className="flex flex-1 min-w-0 items-center gap-1.5">
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="flex-1 min-w-0 rounded-xl border border-input bg-background px-3 py-1.5 text-lg font-semibold"
            />
            <button
              onClick={saveTitle}
              className="rounded-lg p-1.5 text-primary hover:bg-muted"
              aria-label="Save title"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEditTitle}
            className="group flex flex-1 min-w-0 items-center gap-1.5 text-left"
            title="Rename this chat"
          >
            <h1 className="truncate text-xl font-semibold">{title}</h1>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </button>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          {messages.length > 0 && (
            <button
              onClick={exportChat}
              className="rounded-2xl border border-border p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Export chat"
              title="Export chat"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
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
                  <>
                    {m.imageDataUrl && (
                      <img
                        src={m.imageDataUrl}
                        alt={m.attachmentName ?? "Attached photo"}
                        className="mb-2 max-h-48 rounded-xl border border-primary-foreground/20"
                      />
                    )}
                    {!m.imageDataUrl && m.attachmentName && (
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs opacity-80">
                        <FileText className="h-3.5 w-3.5" /> {m.attachmentName}
                      </div>
                    )}
                    {m.text}
                  </>
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

      {attachment && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/60 px-3 py-2 text-xs">
          {attachment.kind === "image" ? (
            <img
              src={attachment.dataUrl}
              alt={attachment.name}
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="flex-1 min-w-0 truncate">{attachment.name}</span>
          <button
            onClick={() => setAttachment(null)}
            className="rounded-lg p-1 text-muted-foreground hover:text-destructive"
            aria-label="Remove attachment"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.txt,.md,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-2xl border border-input px-3 py-2.5 text-muted-foreground hover:bg-muted"
          aria-label="Attach a file or photo"
          title="Attach a file or photo"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleRecording}
            className={`rounded-2xl border px-3 py-2.5 ${
              recording
                ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                : "border-input text-muted-foreground hover:bg-muted"
            }`}
            aria-label={recording ? "Stop recording" : "Start voice input"}
            title={recording ? "Stop recording" : "Voice input"}
          >
            {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a concept or paste a question…"
          className="flex-1 rounded-2xl border border-input bg-background px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || (!input.trim() && !attachment)}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
