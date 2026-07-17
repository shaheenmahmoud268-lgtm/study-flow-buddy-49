import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Payload the client sends: a snapshot of the student's world. */
const SubjectInput = z.object({
  id: z.string(),
  subjectName: z.string(),
  examDate: z.string().optional().default(""),
  targetGrade: z.string().optional().default(""),
  daysUntilExam: z.number(),
  readiness: z.number(), // 0..1
  totalRevisionTasks: z.number(),
  completedRevisionTasks: z.number(),
  overdueTasks: z.number(),
  upcomingTasks: z.number(),
});

const CheckinInput = z.object({
  date: z.string(),
  mood: z.number(),
  sleepHours: z.number().optional().default(0),
});

const PlanRequest = z.object({
  studentName: z.string().optional().default("student"),
  today: z.string(),
  horizonDays: z.number().min(3).max(60).default(14),
  subjects: z.array(SubjectInput).min(1),
  recentCheckins: z.array(CheckinInput).default([]),
  focusMinutesLast7: z.number().default(0),
});

export type ElitePlan = {
  summary: string;
  strategy: string;
  riskFlags: string[];
  dailyLoadMinutes: number;
  sessions: {
    date: string; // YYYY-MM-DD
    subjectId: string;
    subjectName: string;
    title: string;
    type: "revision" | "homework";
    focusMinutes: number;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
  }[];
  checkinNudges: {
    date: string;
    prompt: string;
  }[];
};

const SYSTEM = `You are an elite academic performance strategist for IGCSE / O-Level / A-Level students.
Given a snapshot of subjects, exam distance, readiness, task load, mood, sleep and focus history,
produce an adaptive study plan that maximises the probability of hitting each target grade.

Rules:
- Weight sessions by (1 - readiness) * urgency(daysUntilExam) * targetGradeAmbition. Subjects with sooner exams and lower readiness get more sessions.
- Never assign more than dailyLoadMinutes of study per day across all subjects. Cap dailyLoadMinutes at 240 for teens.
- If mood has been <=2 for 2+ recent days OR average sleep <6h, reduce load ~30%, add rest, and add gentle check-in nudges.
- Interleave subjects (don't stack same subject two days in a row unless exam <7 days away).
- Session titles must be concrete ("Revise algebraic fractions", "Practice past paper Q3-6"), not generic.
- Priority: critical if exam <=14 days OR overdue tasks >2; high if exam <=30 days; medium <=60; else low.
- Cover the full horizonDays window. Return 1-3 sessions per day, evenly distributed.`;

// Gemini structured-output schema (subset of OpenAPI schema, no "required"
// arrays inside items the way OpenAI's does — Gemini wants it at each
// object level, which is what's used below).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    strategy: { type: "STRING" },
    riskFlags: { type: "ARRAY", items: { type: "STRING" } },
    dailyLoadMinutes: { type: "NUMBER" },
    sessions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          subjectId: { type: "STRING" },
          subjectName: { type: "STRING" },
          title: { type: "STRING" },
          type: { type: "STRING", enum: ["revision", "homework"] },
          focusMinutes: { type: "NUMBER" },
          priority: { type: "STRING", enum: ["critical", "high", "medium", "low"] },
          rationale: { type: "STRING" },
        },
        required: [
          "date",
          "subjectId",
          "subjectName",
          "title",
          "type",
          "focusMinutes",
          "priority",
          "rationale",
        ],
      },
    },
    checkinNudges: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          prompt: { type: "STRING" },
        },
        required: ["date", "prompt"],
      },
    },
  },
  required: ["summary", "strategy", "riskFlags", "dailyLoadMinutes", "sessions", "checkinNudges"],
};

export const generateElitePlan = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PlanRequest.parse(raw))
  .handler(async ({ data }): Promise<ElitePlan> => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY missing on server. Get a free key at aistudio.google.com/apikey " +
          "and add it as an env var in Vercel.",
      );
    }

    const userPrompt = `Today: ${data.today}\nStudent: ${data.studentName}\nHorizon: ${data.horizonDays} days\nFocus minutes last 7 days: ${data.focusMinutesLast7}\n\nSubjects:\n${JSON.stringify(data.subjects, null, 2)}\n\nRecent check-ins (mood 1-5):\n${JSON.stringify(data.recentCheckins, null, 2)}\n\nProduce an adaptive plan covering the next ${data.horizonDays} days.`;

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("AI rate limit — try again in a moment.");
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("AI returned no plan payload");
    return JSON.parse(text) as ElitePlan;
  });
