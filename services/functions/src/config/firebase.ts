import * as admin from "firebase-admin";
import { env } from "./env";

export const Collections = {
  USERS:        "users",
  TRANSACTIONS: "transactions",
  LEDGER:       "ledger",
  FX_RATES:     "fx_rates",
  LIQUIDITY:    "liquidity_snapshots",
} as const;

function initializeAdmin(): void {
  if (admin.apps.length > 0) return;
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

// Lazy getters — only initialize when first accessed, not at module load
export function getDb(): FirebaseFirestore.Firestore {
  initializeAdmin();
  return admin.firestore();
}

export function getAuth(): admin.auth.Auth {
  initializeAdmin();
  return admin.auth();
}

// Keep db and auth as lazy properties for backward compatibility
export const db = new Proxy({} as FirebaseFirestore.Firestore, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const auth = new Proxy({} as admin.auth.Auth, {
  get(_target, prop) {
    return (getAuth() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default admin;
