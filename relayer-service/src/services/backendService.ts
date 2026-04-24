import axios, { AxiosInstance, AxiosError } from "axios";
import { config } from "../config";
import { logger } from "../logger";
import { withRetry } from "../utils/retry";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransferInitiatedPayload {
  txId:        string;
  sender:      string;
  recipient:   string;
  amount:      string; // raw bigint as string
  fee:         string;
  netAmount:   string;
  timestamp:   number;
  blockNumber: number;
  txHash:      string;
}

export interface TransferCompletedPayload {
  txId:        string;
  recipient:   string;
  netAmount:   string;
  timestamp:   number;
  blockNumber: number;
  txHash:      string;
}

export interface TransferCancelledPayload {
  txId:        string;
  sender:      string;
  amount:      string;
  timestamp:   number;
  blockNumber: number;
  txHash:      string;
}

// What the backend tells the relayer to do
export type TransferAction = "complete" | "cancel" | "pending";

export interface BackendTransferResponse {
  action:  TransferAction;
  message: string;
}

// ─── Backend Service ──────────────────────────────────────────────────────────

export class BackendService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.backendApiUrl,
      timeout: 30_000,
      headers: {
        "Content-Type":    "application/json",
        // Shared secret so backend can verify this is our relayer
        "x-relayer-secret": config.relayerApiSecret,
      },
    });

    // ── Response interceptor for structured logging ──────────────────────
    this.client.interceptors.response.use(
      (response) => {
        logger.debug("Backend response", {
          status: response.status,
          url:    response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error("Backend request failed", {
          status:  error.response?.status,
          url:     error.config?.url,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Notify backend a transfer was initiated on-chain.
   * Backend validates and returns what action to take.
   */
  async notifyTransferInitiated(
    payload: TransferInitiatedPayload
  ): Promise<BackendTransferResponse> {
    return withRetry(
      async () => {
        const response = await this.client.post<BackendTransferResponse>(
          "/relayer/transfer-initiated",
          payload
        );
        return response.data;
      },
      {
        maxRetries:    config.maxRetries,
        delayMs:       config.retryDelayMs,
        backoffFactor: 2,
        label:         "notifyTransferInitiated",
      }
    );
  }

  /**
   * Notify backend a transfer was completed on-chain.
   */
  async notifyTransferCompleted(
    payload: TransferCompletedPayload
  ): Promise<void> {
    return withRetry(
      async () => {
        await this.client.post("/relayer/transfer-completed", payload);
      },
      {
        maxRetries:    config.maxRetries,
        delayMs:       config.retryDelayMs,
        backoffFactor: 2,
        label:         "notifyTransferCompleted",
      }
    );
  }

  /**
   * Notify backend a transfer was cancelled on-chain.
   */
  async notifyTransferCancelled(
    payload: TransferCancelledPayload
  ): Promise<void> {
    return withRetry(
      async () => {
        await this.client.post("/relayer/transfer-cancelled", payload);
      },
      {
        maxRetries:    config.maxRetries,
        delayMs:       config.retryDelayMs,
        backoffFactor: 2,
        label:         "notifyTransferCancelled",
      }
    );
  }

  /**
   * Health check — called on startup to verify backend is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get("/relayer/health");
      return true;
    } catch {
      return false;
    }
  }
}