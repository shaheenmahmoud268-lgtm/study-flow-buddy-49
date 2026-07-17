import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore, FieldValue } from "firebase-admin/firestore";

const CEO_EMAIL = "shaheenmahmoud268@gmail.com";

/**
 * Lazily initialise the Firebase Admin app from a service account JSON
 * stored in the FIREBASE_SERVICE_ACCOUNT env var (server-only, never
 * exposed to the client). Get this JSON from:
 * Firebase Console -> Project Settings -> Service accounts -> Generate new private key.
 */
function getAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT missing on server. Add the service account JSON " +
        "(Firebase Console -> Project Settings -> Service accounts -> Generate new private key) " +
        "as an env var in Vercel.",
    );
  }

  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }

  return initializeApp({ credential: cert(serviceAccount as never) });
}

const CreateAccountInput = z.object({
  // ID token of the caller, so we can verify server-side that they are
  // actually the CEO. Never trust a client-sent "isAdmin" boolean.
  callerIdToken: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  examBoard: z.enum(["Cambridge", "Edexcel"]).default("Cambridge"),
});

export type CreateAccountResult = {
  uid: string;
  email: string;
};

export const createStudentAccount = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => CreateAccountInput.parse(raw))
  .handler(async ({ data }): Promise<CreateAccountResult> => {
    const app = getAdminApp();
    const adminAuth = getAdminAuth(app);
    const adminDb = getAdminFirestore(app);

    // Verify the caller is signed in AND is the CEO. This check happens
    // server-side against a verified ID token, so it can't be spoofed by
    // editing client state.
    const decoded = await adminAuth.verifyIdToken(data.callerIdToken).catch(() => null);
    if (!decoded || decoded.email?.toLowerCase() !== CEO_EMAIL) {
      throw new Error("Only the Elite CEO account can create student accounts.");
    }

    const userRecord = await adminAuth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
      emailVerified: false,
    });

    await adminDb
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name: data.name,
        examBoard: data.examBoard,
        role: "student",
        createdAt: FieldValue.serverTimestamp(),
        createdByCeo: true,
      });

    return { uid: userRecord.uid, email: data.email };
  });
