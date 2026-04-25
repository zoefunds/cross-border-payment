import * as admin from "firebase-admin";
import { env } from "./env";
import { logger } from "../utils/logger";

if (!admin.apps.length) {
  try {
    const isEmulator =
      process.env["FUNCTIONS_EMULATOR"] === "true" ||
      process.env["FIRESTORE_EMULATOR_HOST"] !== undefined;

    if (isEmulator) {
      // Force emulator hosts so Admin SDK talks to local emulators
      process.env["FIRESTORE_EMULATOR_HOST"] = process.env["FIRESTORE_EMULATOR_HOST"] ?? "127.0.0.1:8080";
      process.env["FIREBASE_AUTH_EMULATOR_HOST"] = process.env["FIREBASE_AUTH_EMULATOR_HOST"] ?? "127.0.0.1:9099";

      admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
      logger.info("Firebase Admin initialized in EMULATOR mode", {
        projectId: env.FIREBASE_PROJECT_ID,
        firestoreEmulator: process.env["FIRESTORE_EMULATOR_HOST"],
        authEmulator: process.env["FIREBASE_AUTH_EMULATOR_HOST"],
      });
    } else if (
      process.env["FUNCTION_TARGET"] !== undefined ||
      process.env["K_SERVICE"] !== undefined
    ) {
      admin.initializeApp();
      logger.info("Firebase Admin initialized with ADC");
    } else {
      if (!env.FB_PRIVATE_KEY || !env.FB_CLIENT_EMAIL) {
        throw new Error("FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL required");
      }
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID,
          privateKey: env.FB_PRIVATE_KEY.replace(/\\n/g, "\n"),
          clientEmail: env.FB_CLIENT_EMAIL,
        }),
        projectId: env.FIREBASE_PROJECT_ID,
      });
      logger.info("Firebase Admin initialized with service account", {
        projectId: env.FIREBASE_PROJECT_ID,
      });
    }
  } catch (error) {
    logger.error("Failed to initialize Firebase Admin", { error });
    process.exit(1);
  }
}

export const db = admin.firestore();
export const auth = admin.auth();
export { admin };

export const Collections = {
  USERS: "users",
  TRANSACTIONS: "transactions",
  LEDGER: "ledger",
  FX_RATES: "fxRates",
} as const;

export type CollectionName = typeof Collections[keyof typeof Collections];
