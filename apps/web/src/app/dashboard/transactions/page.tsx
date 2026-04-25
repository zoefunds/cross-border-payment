"use client";
import { useEffect, useState } from "react";
import { transactionApi, Transaction } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import toast from "react-hot-toast";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: "badge-success", FAILED: "badge-failed", REFUNDED: "badge-failed",
  };
  return <span className={`badge ${map[status] ?? "badge-pending"}`}>{status.replace(/_/g, " ")}</span>;
}

export default function TransactionsPage() {
  const { profile } = useAuthStore();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    transactionApi.getHistory()
      .then(r => setTxs(r.data.transactions))
      .catch(() => toast.error("Failed to load transactions"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
      <div style={{ width: "32px", height: "32px", border: "2px solid var(--border)", borderTopColor: "var(--accent-green)", borderRadius: "50%" }} className="animate-spin-slow" />
    </div>
  );

  return (
    <div className="animate-fade-up">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 700, marginBottom: "24px" }}>
        Transaction history
      </h1>

      {txs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "64px" }}>
          <p style={{ fontSize: "40px", marginBottom: "12px" }}>📭</p>
          <p style={{ color: "var(--text-secondary)" }}>No transactions yet.</p>
          <Link href="/dashboard/send" style={{ color: "var(--accent-green)", textDecoration: "none", fontSize: "14px" }}>
            Send your first payment →
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {txs.map(tx => {
            const isSender = tx.senderId === profile?.id;
            const ts = tx.createdAt?._seconds ? new Date(tx.createdAt._seconds * 1000) : null;
            return (
              <Link key={tx.id} href={`/dashboard/transactions/${tx.id}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-light)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: isSender ? "rgba(0,229,160,0.08)" : "rgba(245,200,66,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
                      {isSender ? "↗" : "↙"}
                    </div>
                    <div>
                      <p style={{ fontWeight: 500, fontSize: "14px" }}>
                        {isSender ? `To ${tx.receiverName}` : `From ${tx.senderName}`}
                      </p>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {ts ? format(ts, "dd MMM yyyy · HH:mm") : "—"}
                        {" · "}
                        {ts ? formatDistanceToNow(ts, { addSuffix: true }) : ""}
                      </p>
                      {tx.blockchain?.txHash && (
                        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                          {tx.blockchain.txHash.slice(0, 10)}…{tx.blockchain.txHash.slice(-6)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: "16px", color: isSender ? "var(--text-primary)" : "var(--accent-green)" }}>
                      {isSender ? "−" : "+"}{tx.sourceCurrency === "NGN" ? "₦" : "₵"}{tx.sourceAmount.toLocaleString()}
                    </p>
                    <div style={{ marginTop: "4px" }}><StatusBadge status={tx.status} /></div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
