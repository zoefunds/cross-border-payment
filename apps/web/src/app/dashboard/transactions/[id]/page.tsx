"use client";
import { useEffect, useState, useCallback } from "react";
import { transactionApi, Transaction } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";

const STEPS = [
  "INITIATED", "NAIRA_DEBITED", "USDC_SENT",
  "CEDIS_CREDITED", "COMPLETED",
];

const STEP_LABELS: Record<string, string> = {
  INITIATED:      "Payment initiated",
  NAIRA_DEBITED:  "Naira debited",
  USDC_SENT:      "USDC sent on Base Sepolia",
  CEDIS_CREDITED: "Cedis credited",
  COMPLETED:      "Completed",
};

function StepTracker({ status }: { status: string }) {
  const isFailed = status === "FAILED" || status === "REFUNDED";
  const currentIdx = STEPS.indexOf(status);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {STEPS.map((step, idx) => {
        const done    = currentIdx > idx || status === "COMPLETED";
        const active  = currentIdx === idx && !isFailed;
        const failed  = isFailed && currentIdx === idx;

        return (
          <div key={step} style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            {/* Dot + line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "20px" }}>
              <div style={{
                width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${done ? "var(--accent-green)" : active ? "var(--accent-green)" : failed ? "var(--accent-red)" : "var(--border)"}`,
                background: done ? "var(--accent-green)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", color: done ? "#000" : "transparent",
              }}>
                {done ? "✓" : active ? <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent-green)" }} /> : ""}
              </div>
              {idx < STEPS.length - 1 && (
                <div style={{ width: "2px", height: "32px", background: done ? "var(--accent-green)" : "var(--border)", marginTop: "2px" }} />
              )}
            </div>
            {/* Label */}
            <div style={{ paddingBottom: idx < STEPS.length - 1 ? "28px" : "0", paddingTop: "1px" }}>
              <p style={{ fontSize: "14px", fontWeight: active || done ? 600 : 400, color: done ? "var(--text-primary)" : active ? "var(--accent-green)" : "var(--text-secondary)" }}>
                {STEP_LABELS[step]}
              </p>
              {active && !isFailed && (
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Processing…
                </p>
              )}
            </div>
          </div>
        );
      })}

      {isFailed && (
        <div style={{ marginTop: "16px", padding: "12px 16px", background: "rgba(255,77,77,0.08)", borderRadius: "8px", border: "1px solid rgba(255,77,77,0.2)" }}>
          <p style={{ color: "var(--accent-red)", fontSize: "14px", fontWeight: 500 }}>
            {status === "REFUNDED" ? "Payment refunded to sender" : "Payment failed"}
          </p>
        </div>
      )}
    </div>
  );
}

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await transactionApi.getById(id);
      setTx(res.data.transaction);
    } catch { toast.error("Transaction not found"); router.push("/dashboard/transactions"); }
    finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => {
    load();
    // Poll every 4s while in-progress
    const interval = setInterval(() => {
      if (tx && !["COMPLETED", "FAILED", "REFUNDED"].includes(tx.status)) load();
    }, 4000);
    return () => clearInterval(interval);
  }, [load, tx]);

  if (loading || !tx) return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
      <div style={{ width: "32px", height: "32px", border: "2px solid var(--border)", borderTopColor: "var(--accent-green)", borderRadius: "50%" }} className="animate-spin-slow" />
    </div>
  );

  const ts = tx.createdAt?._seconds ? new Date(tx.createdAt._seconds * 1000) : null;

  return (
    <div className="animate-fade-up" style={{ maxWidth: "600px", margin: "0 auto" }}>
      <button onClick={() => router.back()} className="btn btn-ghost" style={{ fontSize: "13px", marginBottom: "24px", padding: "6px 14px" }}>
        ← Back
      </button>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 700, marginBottom: "24px" }}>
        Transaction details
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Amount card */}
        <div className="card" style={{ textAlign: "center", padding: "32px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
            {tx.senderName} → {tx.receiverName}
          </p>
          <p style={{ fontSize: "40px", fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "-0.02em" }}>
            {tx.sourceCurrency === "NGN" ? "₦" : "₵"}{tx.sourceAmount.toLocaleString()}
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            → {tx.destinationCurrency === "GHS" ? "₵" : "₦"}{tx.destinationAmount.toLocaleString()} received
          </p>
          {ts && <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>{format(ts, "dd MMM yyyy · HH:mm")}</p>}
        </div>

        {/* Status tracker */}
        <div className="card">
          <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "20px", color: "var(--text-secondary)" }}>
            SETTLEMENT PROGRESS
          </h3>
          <StepTracker status={tx.status} />
        </div>

        {/* Blockchain details */}
        {tx.blockchain?.txHash && (
          <div className="card">
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px", color: "var(--text-secondary)" }}>
              ON-CHAIN DETAILS
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Network</span>
                <span style={{ fontWeight: 500 }}>Base Sepolia</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Tx hash</span>
                <a href={`https://sepolia.basescan.org/tx/${tx.blockchain.txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--accent-green)", textDecoration: "none", fontFamily: "monospace", fontSize: "12px" }}>
                  {tx.blockchain.txHash.slice(0, 12)}…{tx.blockchain.txHash.slice(-8)} ↗
                </a>
              </div>
              {tx.blockchain.blockNumber && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Block</span>
                  <span style={{ fontFamily: "monospace" }}>#{tx.blockchain.blockNumber}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
