"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/auth.store";
import { fxApi, transactionApi, ledgerApi, FxRate } from "@/lib/api";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";

export default function SendPage() {
  const { profile } = useAuthStore();
  const router = useRouter();
  const [step, setStep] = useState<"form" | "confirm" | "sending" | "done">("form");
  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState<FxRate | null>(null);
  const [balance, setBalance] = useState(0);
  const [txId, setTxId] = useState("");

  const isNigerian = profile?.country === "NG";
  const sourceCurrency = isNigerian ? "NGN" : "GHS";
  const symbol = isNigerian ? "₦" : "₵";
  const destSymbol = isNigerian ? "₵" : "₦";

  const loadRate = useCallback(async () => {
    try {
      const [rateRes, balRes] = await Promise.all([fxApi.getRate(), ledgerApi.getBalance()]);
      setRate(rateRes.data.rate);
      setBalance(isNigerian ? balRes.data.nairaBalance : balRes.data.cedisBalance);
    } catch { toast.error("Failed to load FX rate"); }
  }, [isNigerian]);

  useEffect(() => { loadRate(); }, [loadRate]);

  const numAmount = parseFloat(amount) || 0;
  const fee = numAmount * 0.015;
  const afterFee = numAmount - fee;
  const destAmount = rate ? afterFee * rate.effectiveRate : 0;

  async function handleSend() {
    if (!receiverId.trim()) { toast.error("Enter a receiver ID"); return; }
    if (numAmount < 500) { toast.error("Minimum is ₦500"); return; }
    if (numAmount > balance) { toast.error("Insufficient balance"); return; }
    setStep("confirm");
  }

  async function handleConfirm() {
    setStep("sending");
    const key = uuidv4();
    try {
      const res = await transactionApi.send({
        receiverId: receiverId.trim(),
        sourceAmount: numAmount,
        sourceCurrency,
        idempotencyKey: key,
      });
      setTxId(res.data.transaction.id);
      setStep("done");
      toast.success("Payment initiated!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      toast.error(msg);
      setStep("form");
    }
  }

  if (step === "sending") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "20px" }}>
      <div style={{ width: "48px", height: "48px", border: "3px solid var(--border)", borderTopColor: "var(--accent-green)", borderRadius: "50%" }} className="animate-spin-slow" />
      <p style={{ color: "var(--text-secondary)" }}>Processing your payment on Base Sepolia…</p>
    </div>
  );

  if (step === "done") return (
    <div className="animate-fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", paddingTop: "60px" }}>
      <div style={{ fontSize: "64px" }}>✅</div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "28px", fontWeight: 700 }}>Payment initiated</h1>
      <p style={{ color: "var(--text-secondary)", textAlign: "center", maxWidth: "380px" }}>
        Your payment is being settled on Base Sepolia. The recipient will receive their funds shortly.
      </p>
      <div style={{ display: "flex", gap: "12px" }}>
        <button onClick={() => router.push(`/dashboard/transactions/${txId}`)} className="btn btn-primary">
          Track transaction
        </button>
        <button onClick={() => { setStep("form"); setAmount(""); setReceiverId(""); }} className="btn btn-ghost">
          Send another
        </button>
      </div>
    </div>
  );

  if (step === "confirm") return (
    <div className="animate-fade-up" style={{ maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 700, marginBottom: "32px" }}>
        Confirm payment
      </h1>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {[
          ["You send",    `${symbol}${numAmount.toLocaleString()} ${sourceCurrency}`],
          ["Platform fee (1.5%)", `${symbol}${fee.toLocaleString(undefined, { maximumFractionDigits: 2 })}`],
          ["FX rate",    `1 ${sourceCurrency} = ${destSymbol}${rate?.effectiveRate.toFixed(4)}`],
          ["Recipient gets", `${destSymbol}${destAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`],
          ["Settled via", "Base Sepolia (USDC escrow)"],
        ].map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", paddingBottom: "16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>{label}</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: label === "Recipient gets" ? "var(--accent-green)" : "var(--text-primary)" }}>{value}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <button onClick={() => setStep("form")} className="btn btn-ghost" style={{ flex: 1 }}>Back</button>
          <button onClick={handleConfirm} className="btn btn-primary" style={{ flex: 2 }}>Confirm & send</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-up" style={{ maxWidth: "520px", margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 700, marginBottom: "8px" }}>
        Send money {isNigerian ? "🇳🇬→🇬🇭" : "🇬🇭→🇳🇬"}
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "32px", fontSize: "14px" }}>
        Balance: <strong style={{ color: "var(--text-primary)" }}>{symbol}{balance.toLocaleString()}</strong>
      </p>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div>
          <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>
            Receiver's user ID
          </label>
          <input value={receiverId} onChange={e => setReceiverId(e.target.value)} placeholder="Paste receiver's ID" />
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
            Ask the recipient to share their user ID from their profile
          </p>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>
            Amount ({sourceCurrency})
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontFamily: "var(--font-display)", fontWeight: 700 }}>
              {symbol}
            </span>
            <input
              type="number" value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0" min="500"
              style={{ paddingLeft: "32px", fontSize: "20px", fontFamily: "var(--font-display)", fontWeight: 700 }}
            />
          </div>
        </div>

        {numAmount > 0 && rate && (
          <div style={{ background: "var(--bg-elevated)", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              ["Fee (1.5%)", `−${symbol}${fee.toFixed(2)}`],
              ["Rate", `1 ${sourceCurrency} = ${destSymbol}${rate.effectiveRate.toFixed(4)}`],
              ["Recipient receives", `${destSymbol}${destAmount.toFixed(2)}`],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "var(--text-secondary)" }}>{l}</span>
                <span style={{ fontWeight: 500, color: l.includes("receives") ? "var(--accent-green)" : "var(--text-primary)" }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <button onClick={handleSend} className="btn btn-primary" style={{ width: "100%" }}
          disabled={!amount || numAmount <= 0}>
          Review payment →
        </button>
      </div>
    </div>
  );
}
