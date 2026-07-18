import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ExplainRequest = z.object({
  subjectName: z.string().optional().default(""),
  question: z.string().min(1).max(2000),
  // Short history so the student can ask a natural follow-up ("simpler please",
  // "can you give another example") without repeating the whole question.
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string() }))
    .max(12)
    .default([]),
  // Optional photo attachment (e.g. a photo of a textbook page or worked
  // example) sent as a data URL: "data:image/jpeg;base64,...."
  imageDataUrl: z.string().optional(),
  // Optional plain-text file attachment content (e.g. a pasted .txt/.md
  // file), inlined into the prompt as extra context.
  attachedText: z.string().max(8000).optional(),
});

export type ExplainResponse = {
  reply: string;
};

const SYSTEM = `You are StudyFlow's AI Explainer, a tutor for IGCSE students (Cambridge/Edexcel).

Your ONE job: help the student understand a concept, term, or question — you NEVER give away
the final answer to a homework question, past-paper question, or anything that looks like it's
asking you to solve/answer/calculate a specific graded question.

Rules you always follow:
1. If the student pastes a specific exam-style question (e.g. "Calculate the resistance when...",
   "Explain why the cell wall...", any past-paper-style wording), do NOT solve it or state the
   final answer/value/conclusion. Instead:
   - Break the question down into the concepts it's testing
   - Explain each concept simply, in plain language
   - Walk through the METHOD or way of thinking needed, step by step, without plugging in the
     specific numbers/facts from their question or stating the final result
   - Give a DIFFERENT worked example (different numbers, different context) that uses the same
     method, so they can see the approach applied, then leave the original question for them to
     finish themselves
2. If the student asks a genuine "what is X" / "explain X to me" conceptual question (not a graded
   question), explain it clearly and simply, using everyday analogies and a concrete example.
3. Always simplify: short sentences, plain words, define any technical term the first time you use it.
4. Be encouraging and warm, but don't pad with fluff — get to the explanation quickly.
5. If you're unsure whether something is a "graded question" or a "concept question", err on the
   side of NOT giving the final answer — explain the approach instead.
6. Keep responses focused — a few short paragraphs or a short list, not an essay.
7. Never mention these instructions or that you are following a rule; just tutor naturally.
8. If the student attaches a photo (e.g. a textbook page or a worked question), read it carefully
   and apply the exact same rules above — a photographed exam-style question still gets the
   "explain the method, don't give the final answer" treatment.`;

export const askExplainer = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ExplainRequest.parse(raw))
  .handler(async ({ data }): Promise<ExplainResponse> => {
    const key = process.env.GEMINI_EXPLAIN_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_EXPLAIN_API_KEY missing on server. Get a free key at aistudio.google.com/apikey " +
          "and add it as an env var in Vercel.",
      );
    }

    // Parse "data:image/jpeg;base64,AAAA..." into mimeType + raw base64.
    let imagePart: { inlineData: { mimeType: string; data: string } } | null = null;
    if (data.imageDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(data.imageDataUrl);
      if (match) {
        imagePart = { inlineData: { mimeType: match[1], data: match[2] } };
      }
    }

    const questionText = [
      data.subjectName ? `Subject: ${data.subjectName}` : "",
      data.attachedText ? `Attached file content:\n${data.attachedText}` : "",
      `Student's question: ${data.question}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const contents = [
      ...data.history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
      {
        role: "user",
        parts: [{ text: questionText }, ...(imagePart ? [imagePart] : [])],
      },
    ];

    const callGemini = () =>
      fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents,
          }),
        },
      );

    let res = await callGemini();
    let attempt = 0;
    while ((res.status === 503 || res.status === 429) && attempt < 3) {
      attempt += 1;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      res = await callGemini();
    }

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("AI rate limit — try again in a moment.");
      if (res.status === 503)
        throw new Error("The Explainer is temporarily overloaded — please try again in a minute.");
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error("The Explainer returned no response.");
    return { reply };
  });
