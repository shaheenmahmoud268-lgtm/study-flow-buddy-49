export const IGCSE_SUBJECTS = [
  "Mathematics",
  "English Language",
  "English Literature",
  "Physics",
  "Chemistry",
  "Biology",
  "Combined Science",
  "History",
  "Geography",
  "Economics",
  "Business Studies",
  "Computer Science",
  "ICT",
  "French",
  "Spanish",
  "German",
  "Mandarin",
  "Arabic",
  "Art & Design",
  "Music",
  "Physical Education",
  "Religious Studies",
  "Sociology",
  "Psychology",
  "Accounting",
];

export const O_LEVEL_SUBJECTS = IGCSE_SUBJECTS;

export const A_LEVEL_SUBJECTS = [
  "Mathematics",
  "Further Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "History",
  "Geography",
  "Economics",
  "Business Studies",
  "Computer Science",
  "French",
  "Spanish",
  "Psychology",
  "Sociology",
  "Accounting",
  "Art & Design",
  "English Literature",
  "Law",
];

export const LEVELS = ["O-Level", "A-Level"] as const;
export type Level = (typeof LEVELS)[number];

export function subjectsForLevel(level: Level): string[] {
  return level === "A-Level" ? A_LEVEL_SUBJECTS : O_LEVEL_SUBJECTS;
}

export const EXAM_BOARDS = ["Cambridge", "Edexcel"] as const;
export type ExamBoard = (typeof EXAM_BOARDS)[number];

export const GRADES = ["9", "8", "7", "6", "5", "4", "A*", "A", "B", "C"];

// IGCSE exams run in fixed windows. Students think in terms of "May/June 27"
// rather than an exact calendar date, so onboarding/subjects let them pick a
// session + year. We still store a concrete ISO date under the hood (the
// session's results-day-adjacent end date) so countdowns, calendar sorting,
// and readiness % keep working unchanged.
export const EXAM_SESSIONS = ["May/June", "October/November", "January"] as const;
export type ExamSession = (typeof EXAM_SESSIONS)[number];

const SESSION_END_MD: Record<ExamSession, [number, number]> = {
  "May/June": [6, 15], // month, day
  "October/November": [11, 10],
  January: [1, 25],
};

/** Build a display label like "May/June 27" from a session + full year. */
export function sessionLabel(session: ExamSession, year: number): string {
  return `${session} ${String(year).slice(-2)}`;
}

/** Convert a session + full year into an ISO date (YYYY-MM-DD) for countdowns. */
export function sessionToISODate(session: ExamSession, year: number): string {
  const [month, day] = SESSION_END_MD[session];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parse a "May/June 27" style label back into { session, year }, if possible. */
export function parseSessionLabel(label: string): { session: ExamSession; year: number } | null {
  const match = EXAM_SESSIONS.find((s) => label.startsWith(s));
  if (!match) return null;
  const yearPart = label.slice(match.length).trim();
  const yy = parseInt(yearPart, 10);
  if (Number.isNaN(yy)) return null;
  return { session: match, year: 2000 + yy };
}
