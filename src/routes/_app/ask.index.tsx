import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/ask/")({
  ssr: false,
  component: AskIndex,
});

function AskIndex() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // If there's an existing conversation, jump to the most recent one.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, "users", user.uid, "askThreads"),
        orderBy("updatedAt", "desc"),
        limit(1),
      ),
      (snap) => {
        const first = snap.docs[0];
        if (first) {
          navigate({
            to: "/ask/$threadId",
            params: { threadId: first.id },
            replace: true,
          });
        }
      },
    );
    return unsub;
  }, [user, navigate]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
      <Sparkles className="h-8 w-8 text-muted-foreground/50" />
      <h2 className="mt-3 text-lg font-semibold">Start a conversation</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Ask about a concept, or paste a question you want explained (not solved). Your chats are
        saved so you can come back anytime.
      </p>
    </div>
  );
}
