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

export const EXAM_BOARDS = ["Cambridge", "Edexcel"] as const;
export type ExamBoard = (typeof EXAM_BOARDS)[number];

export const GRADES = ["9", "8", "7", "6", "5", "4", "A*", "A", "B", "C"];
