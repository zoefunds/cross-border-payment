"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/store/auth.store";
import { ledgerApi, transactionApi, fxApi, Transaction, FxRate } from "@/lib/api";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: "badge-success", FAILED: "badge-failed", REFUNDED: "badge-failed",
  };
  const cls = map[status] ?? "badge-pending";
  return <span className={`badge ${cls}`}>{status.replace(/_/g, " ")}</span>;
}

export default function DashboardPage() {
  const { profile } = useAuthStore();
  const [balances, setBalances] = useState<{ nairaBalance: number; cedisBalance: number } | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [rate, setRate] = useState<FxRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [balRes, txRes, rateRes] = await Promise.all([
        ledgerApi.getBalance(),
        transactionApi.getHistory(),
        fxApi.getRate(),
      ]);
      setBalances(balRes.data);
      setTxs(txRes.data.transactions.slice(0, 5));
      setRate(rateRes.data.rate);
    } catch {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDeposit() {
    const currency = profile?.country === "NG" ? "NGN" : "GHS";
    const amount = currency === "NGN" ? 50000 : 500;
    setDepositing(true);
    try {
      await ledgerApi.deposit(currency, amount);
      toast.success(`${currency === "NGN" ? "₦50,000" : "₵500"} added to your balance`);
      await load();
    } catch { toast.error("Deposit failed"); }
    finally { setDepositing(false); }
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "80px" }}>
      <div style={{ width: "32px", height: "32px", border: "2px solid var(--border)", borderTopColor: "var(--accent-green)", borderRadius: "50%" }} className="animate-spin-slow" />
    </div>
  );

  const isNigerian = profile?.country === "NG";

  return (
    <div className="animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>Good day,</p>
          <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            {profile?.fullName?.split(" ")[0] ?? "User"} 👋
          </h1>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={handleDeposit} disabled={depositing} className="btn btn-ghost" style={{ fontSize: "13px" }}>
            {depositing ? "Adding…" : "＋ Add funds"}
          </button>
          <Link href="/dashboard/send" className="btn btn-primary" style={{ fontSize: "13px" }}>
            Send money →
          </Link>
        </div>
      </div>

      {/* Balances */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
        <div className="card" style={{ borderColor: isNigerian ? "rgba(0,135,81,0.3)" : "var(--border)" }}>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>🇳🇬 Naira balance</p>
          <p style={{ fontSize: "28px", fontFamily: "var(--font-display)", fontWeight: 700 }}>
            ₦{(balances?.nairaBalance ?? 0).toLocaleString()}
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>Nigerian Naira</p>
        </div>

        <div className="card" style={{ borderColor: !isNigerian ? "rgba(207,9,33,0.3)" : "var(--border)" }}>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>🇬🇭 Cedis balance</p>
          <p style={{ fontSize: "28px", fontFamily: "var(--font-display)", fontWeight: 700 }}>
            ₵{(balances?.cedisBalance ?? 0).toLocaleString()}
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>Ghanaian Cedi</p>
        </div>

        <div className="card" style={{ borderColor: "rgba(0,229,160,0.2)" }}>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>⚡ FX Rate</p>
          <p style={{ fontSize: "28px", fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--accent-green)" }}>
            {rate ? `₵${rate.effectiveRate.toFixed(3)}` : "—"}
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>per ₦1 • includes 1.5% fee</p>
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Recent transactions</h2>
          <Link href="/dashboard/transactions" style={{ fontSize: "13px", color: "var(--accent-green)", textDecoration: "none" }}>
            View all →
          </Link>
        </div>

        {txs.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "48px", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "32px", marginBottom: "12px" }}>💸</p>
            <p>No transactions yet.</p>
            <Link href="/dashboard/send" style={{ color: "var(--accent-green)", textDecoration: "none", fontSize: "14px" }}>
              Send your first payment →
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {txs.map(tx => (
              <Link key={tx.id} href={`/dashboard/transactions/${tx.id}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 20px", cursor: "pointer",
                }} onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-light)")}
                   onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "50%",
                      background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "16px",
                    }}>
                      {tx.senderId === profile?.id ? "↗" : "↙"}
                    </div>
                    <div>
                      <p style={{ fontWeight: 500, fontSize: "14px" }}>
                        {tx.senderId === profile?.id ? `To ${tx.receiverName}` : `From ${tx.senderName}`}
                      </p>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {tx.createdAt?._seconds
                          ? formatDistanceToNow(new Date(tx.createdAt._seconds * 1000), { addSuffix: true })
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 600, fontFamily: "var(--font-display)" }}>
                      {tx.sourceCurrency === "NGN" ? "₦" : "₵"}{tx.sourceAmount.toLocaleString()}
                    </p>
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
