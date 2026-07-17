/**
 * Curated resource links for a subject, generated from its board/level/name.
 *
 * Rather than hand-maintaining a database of exact PDF/video URLs (which
 * goes stale the moment an exam board reshuffles their site — CIE and
 * Edexcel both do this every year), each entry points to the *canonical
 * search or hub page* on trusted, current sources. This means links never
 * 404, and always reflect the latest syllabus/papers even after a board
 * restructures their site.
 */

export type ResourceLink = {
  label: string;
  href: string;
  description: string;
};

const BOARD_SYLLABUS_HUB: Record<string, string> = {
  Cambridge: "https://www.cambridgeinternational.org/programmes-and-qualifications/",
  Edexcel: "https://qualifications.pearson.com/en/qualifications/edexcel-igcses.html",
};

const BOARD_PAST_PAPERS_HUB: Record<string, string> = {
  Cambridge: "https://www.cambridgeinternational.org/programmes-and-qualifications/",
  Edexcel: "https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html",
};

function encode(s: string) {
  return encodeURIComponent(s);
}

export function getSubjectResources(opts: {
  subjectName: string;
  examBoard?: string;
  level?: string;
}): {
  syllabus: ResourceLink[];
  pastPapers: ResourceLink[];
  videos: ResourceLink[];
  textbooks: ResourceLink[];
} {
  const { subjectName } = opts;
  const board = opts.examBoard || "Cambridge";
  const level = opts.level || "IGCSE";
  const query = `${board} ${level} ${subjectName}`;

  const syllabus: ResourceLink[] = [
    {
      label: `${board} official syllabus hub`,
      href: BOARD_SYLLABUS_HUB[board] ?? `https://www.google.com/search?q=${encode(`${query} syllabus PDF`)}`,
      description: "Find the current specification/syllabus PDF for your subject and exam session.",
    },
    {
      label: "Search: syllabus PDF",
      href: `https://www.google.com/search?q=${encode(`${query} syllabus specification PDF site:${board === "Cambridge" ? "cambridgeinternational.org" : "qualifications.pearson.com"}`)}`,
      description: "Direct search narrowed to the official exam board site.",
    },
  ];

  const pastPapers: ResourceLink[] = [
    {
      label: `${board} official past papers hub`,
      href: BOARD_PAST_PAPERS_HUB[board] ?? `https://www.google.com/search?q=${encode(`${query} past papers`)}`,
      description: "Official past papers, mark schemes and examiner reports.",
    },
    {
      label: "Past Papers on PapaCambridge",
      href: `https://pastpapers.papacambridge.com/?s=${encode(`${board} ${subjectName}`)}`,
      description: "Free searchable archive of past papers and mark schemes.",
    },
    {
      label: "Physics & Maths Tutor",
      href: `https://www.physicsandmathstutor.com/?s=${encode(`${board} ${subjectName}`)}`,
      description: "Papers organised by topic, plus revision notes (strong for Maths/Sciences).",
    },
    {
      label: "Save My Exams",
      href: `https://www.savemyexams.com/?s=${encode(`${board} ${level} ${subjectName}`)}`,
      description: "Topic questions, model answers and revision notes.",
    },
  ];

  const videos: ResourceLink[] = [
    {
      label: `YouTube: ${subjectName} full course`,
      href: `https://www.youtube.com/results?search_query=${encode(`${query} full revision course`)}`,
      description: "Complete syllabus walkthroughs and crash courses.",
    },
    {
      label: `YouTube: ${subjectName} past paper solutions`,
      href: `https://www.youtube.com/results?search_query=${encode(`${query} past paper worked solutions`)}`,
      description: "Step-by-step solutions to real past paper questions.",
    },
    {
      label: "Khan Academy",
      href: `https://www.khanacademy.org/search?page_search_query=${encode(subjectName)}`,
      description: "Free structured video lessons and practice, useful for core concepts.",
    },
  ];

  // Free, legally-licensed textbooks and official publisher preview chapters
  // only — never pirated copies of copyrighted exam-board textbooks.
  const textbooks: ResourceLink[] = [
    {
      label: "Cambridge University Press — free sample chapters",
      href: `https://www.cambridge.org/gb/education/find-your-local-office?search=${encode(`${level} ${subjectName}`)}`,
      description: "Official endorsed coursebooks often have a free downloadable sample chapter on the publisher page.",
    },
    {
      label: "OpenStax",
      href: `https://openstax.org/subjects`,
      description: "Free, peer-reviewed, openly-licensed textbooks — strong coverage for Maths, Sciences, Economics.",
    },
    {
      label: "CK-12 FlexBooks",
      href: `https://www.ck12.org/search/?q=${encode(subjectName)}`,
      description: "Free, openly-licensed textbooks and interactive material, especially strong for Maths & Science.",
    },
    {
      label: "LibreTexts",
      href: `https://commons.libretexts.org/search?q=${encode(subjectName)}`,
      description: "Free, openly-licensed textbook library, strong for Sciences.",
    },
    {
      label: "Open Textbook Library",
      href: `https://open.umn.edu/opentextbooks/textbooks?term=${encode(subjectName)}`,
      description: "Searchable catalogue of free, legally-licensed textbooks across subjects.",
    },
    {
      label: "Google Books preview",
      href: `https://www.google.com/search?tbm=bks&q=${encode(`${query} textbook`)}`,
      description: "Publisher-authorised preview pages for the exact textbook edition (not a full download).",
    },
  ];

  return { syllabus, pastPapers, videos, textbooks };
}
