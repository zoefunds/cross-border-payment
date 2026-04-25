import * as admin from "firebase-admin";
export declare const Collections: {
    readonly USERS: "users";
    readonly TRANSACTIONS: "transactions";
    readonly LEDGER: "ledger";
    readonly FX_RATES: "fx_rates";
    readonly LIQUIDITY: "liquidity_snapshots";
};
export declare function getDb(): FirebaseFirestore.Firestore;
export declare function getAuth(): admin.auth.Auth;
export declare const db: admin.firestore.Firestore;
export declare const auth: import("firebase-admin/auth").Auth;
export default admin;
