"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = exports.db = exports.Collections = void 0;
exports.getDb = getDb;
exports.getAuth = getAuth;
const admin = __importStar(require("firebase-admin"));
const env_1 = require("./env");
exports.Collections = {
    USERS: "users",
    TRANSACTIONS: "transactions",
    LEDGER: "ledger",
    FX_RATES: "fx_rates",
    LIQUIDITY: "liquidity_snapshots",
};
function initializeAdmin() {
    if (admin.apps.length > 0)
        return;
    if (env_1.env.FB_PRIVATE_KEY && env_1.env.FB_CLIENT_EMAIL) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: env_1.env.FIREBASE_PROJECT_ID,
                privateKey: env_1.env.FB_PRIVATE_KEY.replace(/\\n/g, "\n"),
                clientEmail: env_1.env.FB_CLIENT_EMAIL,
            }),
            projectId: env_1.env.FIREBASE_PROJECT_ID,
        });
    }
    else {
        admin.initializeApp({ projectId: env_1.env.FIREBASE_PROJECT_ID });
    }
}
// Lazy getters — only initialize when first accessed, not at module load
function getDb() {
    initializeAdmin();
    return admin.firestore();
}
function getAuth() {
    initializeAdmin();
    return admin.auth();
}
// Keep db and auth as lazy properties for backward compatibility
exports.db = new Proxy({}, {
    get(_target, prop) {
        return getDb()[prop];
    },
});
exports.auth = new Proxy({}, {
    get(_target, prop) {
        return getAuth()[prop];
    },
});
exports.default = admin;
//# sourceMappingURL=firebase.js.map