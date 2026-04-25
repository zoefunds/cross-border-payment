import * as admin from "firebase-admin";
import { env } from "./env";

export const Collections = {
  USERS:        "users",
  TRANSACTIONS: "transactions",
  LEDGER:       "ledger",
  FX_RATES:     "fx_rates",
  LIQUIDITY:    "liquidity_snapshots",
} as const;

if (!admin.apps.length) {
  if (env.FB_PRIVATE_KEY && env.FB_CLIENT_EMAIL) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   env.FIREBASE_PROJECT_ID,
        privateKey:  env.FB_PRIVATE_KEY.replace(/\\n/g, "\n"),
        clientEmail: env.FB_CLIENT_EMAIL,
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    });
  } else {
    admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  }
}

export const db   = admin.firestore();
export const auth = admin.auth();
export default admin;
