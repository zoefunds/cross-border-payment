import * as admin from "firebase-admin";
import { env } from "./env";

// Collections used across the app
export const Collections = {
  USERS:        "users",
  TRANSACTIONS: "transactions",
  LEDGER:       "ledger",
  FX_RATES:     "fx_rates",
  LIQUIDITY:    "liquidity_snapshots",
} as const;

if (!admin.apps.length) {
  try {
    if (env.FB_PRIVATE_KEY && env.FB_CLIENT_EMAIL) {
      // Production — use service account credentials
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   env.FIREBASE_PROJECT_ID,
          privateKey:  env.FB_PRIVATE_KEY.replace(/\\n/g, "\n"),
          clientEmail: env.FB_CLIENT_EMAIL,
        }),
        projectId: env.FIREBASE_PROJECT_ID,
      });
    } else {
      // Local emulator or analysis — use application default credentials
      admin.initializeApp({
        projectId: env.FIREBASE_PROJECT_ID,
      });
    }
  } catch (err) {
    console.error("Firebase Admin init error:", err);
    // Initialize with minimal config so the process doesn't crash during analysis
    admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  }
}

export const db   = admin.firestore();
export const auth = admin.auth();
export default admin;
