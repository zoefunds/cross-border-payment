import axios from "axios";
import { auth } from "./firebase";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;

const api = axios.create({ baseURL: BASE_URL });

// Attach Firebase ID token to every request
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  fullName: string;
  country: "NG" | "GH";
  nairaBalance: number;
  cedisBalance: number;
  primaryCryptoWallet?: string;
  isActive: boolean;
}

export interface FxRate {
  pair: string;
  rate: number;
  effectiveRate: number;
  provider: string;
}

export interface Transaction {
  id: string;
  type: "NGN_TO_GHS" | "GHS_TO_NGN";
  status: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  sourceAmount: number;
  sourceCurrency: string;
  destinationAmount: number;
  destinationCurrency: string;
  fees: {
    platformFeeNgn: number;
    totalFeeNgn: number;
    feePercentage: number;
  };
  blockchain?: {
    txHash?: string;
    blockNumber?: number;
  };
  createdAt: { _seconds: number };
  completedAt?: { _seconds: number };
}

export interface SendMoneyPayload {
  receiverId: string;
  sourceAmount: number;
  sourceCurrency: "NGN" | "GHS";
  idempotencyKey: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: {
    email: string;
    password: string;
    fullName: string;
    country: "NG" | "GH";
    phoneNumber: string;
  }) => api.post<{ user: User; token: string }>("/auth/register", data),

  getProfile: () => api.get<{ user: User }>("/auth/profile"),

  updateWallet: (walletAddress: string) =>
    api.patch("/auth/wallet", { walletAddress }),
};

// ── FX ────────────────────────────────────────────────────────────────────────

export const fxApi = {
  getRate: (pair = "NGN/GHS") =>
    api.get<{ rate: FxRate }>(`/fx/rate/${pair}`),
};

// ── Ledger ────────────────────────────────────────────────────────────────────

export const ledgerApi = {
  getBalance: () =>
    api.get<{ nairaBalance: number; cedisBalance: number }>("/ledger/balance"),

  deposit: (currency: "NGN" | "GHS", amount: number) =>
    api.post("/ledger/deposit", { currency, amount }),
};

// ── Transactions ──────────────────────────────────────────────────────────────

export const transactionApi = {
  send: (payload: SendMoneyPayload) =>
    api.post<{ transaction: Transaction }>("/transactions/send", payload),

  getHistory: () =>
    api.get<{ transactions: Transaction[] }>("/transactions/history"),

  getById: (id: string) =>
    api.get<{ transaction: Transaction }>(`/transactions/${id}`),
};

export default api;
