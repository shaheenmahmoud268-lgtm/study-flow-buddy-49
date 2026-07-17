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

export const generateElitePlan = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PlanRequest.parse(raw))
  .handler(async ({ data }): Promise<ElitePlan> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing on server");

    const schema = {
      type: "object",
      properties: {
        summary: { type: "string" },
        strategy: { type: "string" },
        riskFlags: { type: "array", items: { type: "string" } },
        dailyLoadMinutes: { type: "number" },
        sessions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string" },
              subjectId: { type: "string" },
              subjectName: { type: "string" },
              title: { type: "string" },
              type: { type: "string", enum: ["revision", "homework"] },
              focusMinutes: { type: "number" },
              priority: {
                type: "string",
                enum: ["critical", "high", "medium", "low"],
              },
              rationale: { type: "string" },
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
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string" },
              prompt: { type: "string" },
            },
            required: ["date", "prompt"],
          },
        },
      },
      required: [
        "summary",
        "strategy",
        "riskFlags",
        "dailyLoadMinutes",
        "sessions",
        "checkinNudges",
      ],
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Today: ${data.today}\nStudent: ${data.studentName}\nHorizon: ${data.horizonDays} days\nFocus minutes last 7 days: ${data.focusMinutesLast7}\n\nSubjects:\n${JSON.stringify(data.subjects, null, 2)}\n\nRecent check-ins (mood 1-5):\n${JSON.stringify(data.recentCheckins, null, 2)}\n\nProduce an adaptive plan covering the next ${data.horizonDays} days.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_plan",
              description: "Return the adaptive study plan.",
              parameters: schema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_plan" } },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("AI rate limit — try again in a moment.");
      if (res.status === 402)
        throw new Error("AI credits exhausted. Add credits in workspace billing.");
      throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no plan payload");
    return JSON.parse(args) as ElitePlan;
  });
