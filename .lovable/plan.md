
# StudyFlow — Build Plan

Before any code, here is my read-back of your spec. I will not start building until you confirm.

## Firestore data structure (read-back)

```
users/{uid}
  name: string
  examBoard: "Cambridge" | "Edexcel"
  createdAt: timestamp

users/{uid}/subjects/{subjectId}
  subjectName, examDate, targetGrade, createdAt

users/{uid}/subjects/{subjectId}/tasks/{taskId}
  title, type: "homework" | "revision", dueDate, isComplete, createdAt

users/{uid}/subjects/{subjectId}/flashcards/{cardId}
  question, answer, lastReviewed, nextReviewDate, easeFactor, createdAt

users/{uid}/dailyCheckins/{checkinId}   // doc id = YYYY-MM-DD
  date, mood (1-5), sleepHours, screenTimeHours, notes, createdAt

users/{uid}/focusSessions/{sessionId}
  subjectId, subjectName, durationMinutes, completedAt
```

Tasks and flashcards are nested under each subject (no foreign keys). `dailyCheckins` uses the date string as doc ID to prevent duplicates. All per-user data lives under `users/{uid}/…`.

## Firestore security rules (read-back)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```
Owner-only, deny by default, rejects unauthenticated requests. I'll paste this into a `firestore.rules` file in the repo for you to deploy via Firebase CLI (Lovable can't push rules to your Firebase project — you'll run `firebase deploy --only firestore:rules`).

## Stack & constraints to flag

- This project's template is **TanStack Start (SSR)**. Firebase Web SDK is browser-only. I will:
  - Disable SSR on all authenticated routes (`ssr: false`) and keep Firebase calls inside `useEffect` / event handlers / client-only components.
  - Keep home `/` as a public landing that redirects to `/auth` or `/dashboard` based on auth state.
- **Tailwind v4** (CSS-first) is already wired. I'll add the soft palette (deep blue, mint green, warm white) as OKLCH tokens in `src/styles.css`, plus gradient tokens for the amber→green progress bar.
- **No Lovable Cloud / Supabase.** Firebase only, per your instruction.
- **Config via env vars:** I'll read from `import.meta.env.VITE_FIREBASE_*` in `src/lib/firebase.ts`. You'll need to add these as build-time env vars in Workspace Settings → Build Secrets (I can't set those for you). The API key you pasted (`@secret:GOOGLE_API_KEY`) is a Firebase Web API key — publishable, safe in client code — so a hardcoded fallback is acceptable if you prefer speed over env vars. Tell me which you want.
- **Google Sign-In:** listed in build order but not in the AUTH section. I'll include it (Firebase `GoogleAuthProvider` popup) unless you say otherwise.

## Architecture

- `src/lib/firebase.ts` — single init: `initializeApp`, `getAuth`, `getFirestore`. Exports `app`, `auth`, `db`.
- `src/lib/auth-context.tsx` — React context wrapping `onAuthStateChanged`; exposes `{ user, loading }`. Renders a full-screen spinner while `loading`.
- `src/routes/__root.tsx` — wraps app in `AuthProvider` + QueryClient; sets title/description to StudyFlow.
- `src/routes/index.tsx` — landing: if signed in → redirect `/dashboard`, else → `/auth`.
- `src/routes/auth.tsx` — combined login/signup (email+password, Google).
- `src/routes/_app/route.tsx` — pathless protected layout (`ssr:false`) with sidebar/bottom-nav; redirects to `/auth` if no user; runs onboarding gate (if `users/{uid}` doc missing or `onboardingComplete !== true`, render onboarding wizard instead of `<Outlet/>`).
- Pages under `_app/`: `dashboard`, `subjects`, `subjects.$subjectId`, `calendar`, `flashcards`, `focus`, `checkin`, `settings`.
- Data access: small hooks per collection using Firestore `onSnapshot` (real-time) via TanStack Query where useful, or plain `useEffect` subscriptions.

## Feature build order (matches your spec)

1. **Firebase init + Auth** — `firebase.ts`, AuthContext, `/auth` (email+password + Google), protected `_app` layout, onboarding wizard (name, exam board, subjects multi-select from fixed IGCSE list, per-subject exam date). Creates `users/{uid}` on signup, sets `onboardingComplete: true` at wizard end.
2. **Firestore rules file** (`firestore.rules` in repo root + deploy instructions).
3. **Dashboard** — greeting + date, Readiness % per subject (completed revision tasks with dueDate ≤ today ÷ total revision tasks with dueDate ≤ today) as amber→green gradient bars, today's tasks with checkboxes (collectionGroup query across subjects, filtered to current user via rules + `where('__name__' … )` — actually I'll iterate subjects then query each `tasks` subcollection for `dueDate == today` since collectionGroup would need composite index; will confirm approach at build time), streak counter (consecutive days with ≥1 completed task from task `updatedAt`/completion timestamps), Start Focus Session button → `/focus`.
4. **Subjects** — list with countdown, add/edit/delete, detail view showing tasks + flashcards.
5. **Revision Calendar** — week/month toggle, shows revision + homework, "Auto-generate revision schedule" (distributes revision tasks evenly across days remaining before `examDate`, weighting by proximity of exam and inverse of current readiness), drag-and-drop reschedule updating `dueDate`. Library: `@dnd-kit/core`.
6. **Flashcards** — per-subject sets, study mode with Again/Hard/Good/Easy, SM-2 update of `easeFactor` and `nextReviewDate`, default filter `nextReviewDate <= today` + "show all" toggle.
7. **Focus Timer** — Pomodoro 25/5 adjustable, subject select required, writes `focusSessions` doc on completion, celebratory animation (framer-motion), today/week bar chart (recharts).
8. **Daily Check-in** — one doc per date (id = YYYY-MM-DD), mood emoji 1-5, sleep + screen time sliders, notes, 14-day line chart of mood + sleep, gentle supportive message if mood ≤ 3 for 3+ consecutive days (non-clinical wording: suggest talking to a parent, teacher, or trusted adult).
9. **Settings** — edit profile / board / subjects / target grades, notifications toggle (visual only), logout.

## Design tokens (added to `src/styles.css`)

- `--background` warm white, `--primary` deep blue, `--accent` mint green, muted variants, `--gradient-readiness` amber→green, rounded-2xl, soft shadows. Fonts: pair a warm sans display (e.g. "Fraunces" or "Instrument Serif" for headings) with "Inter" for body — I'll pick one calm, non-childish pairing and load it via `<link>` in `__root.tsx` (never `@import` remote URLs in CSS on Tailwind v4). Confirm if you have a font preference.

## Packages I'll add

`firebase`, `@dnd-kit/core`, `@dnd-kit/sortable`, `date-fns`, `recharts`, `framer-motion`. `lucide-react` and `tailwind` are already in.

## Non-functional guarantees

- Every query scoped to `auth.currentUser.uid`; rules enforce it server-side.
- Loading spinners and typed empty states on every list.
- Try/catch around every Firestore mutation with a toast on error.
- Single Firebase init module; no duplicate `initializeApp`.

## Things I need you to confirm before I start

1. Data structure + security rules read-back above — matches exactly?
2. Google Sign-In: include it (yes, per build order) or email/password only?
3. Firebase config: use `VITE_FIREBASE_*` env vars (you add them as Build Secrets), or hardcode in `firebase.ts` since the Web API key is publishable?
4. Font pairing preference, or should I pick?

Reply with confirmations (or "all good, proceed") and I'll switch to build mode and ship in the listed order.
