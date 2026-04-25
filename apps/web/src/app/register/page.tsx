"use client";
import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authApi } from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "", email: "", password: "", country: "NG" as "NG" | "GH", phoneNumber: "",
  });

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, form.email, form.password);
      await authApi.register(form);
      toast.success("Account created!");
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      toast.error(msg.includes("email-already-in-use") ? "Email already registered" : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "24px",
      background: "radial-gradient(ellipse at 80% 50%, #1a1000 0%, #080808 60%)",
    }}>
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            fontSize: "28px", fontFamily: "var(--font-display)", fontWeight: 800,
            letterSpacing: "-0.03em",
          }}>
            <span style={{ color: "var(--accent-green)" }}>Africa</span>
            <span style={{ color: "var(--gh-gold)" }}>Pay</span>
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: "6px", fontSize: "14px" }}>
            Create your account
          </p>
        </div>

        <div className="card animate-fade-up">
          <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>Full name</label>
              <input value={form.fullName} onChange={e => update("fullName", e.target.value)} placeholder="Ada Okonkwo" required />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>Email</label>
              <input type="email" value={form.email} onChange={e => update("email", e.target.value)} placeholder="you@example.com" required />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>Phone number</label>
              <input value={form.phoneNumber} onChange={e => update("phoneNumber", e.target.value)} placeholder="+234 800 000 0000" required />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>Country</label>
              <select value={form.country} onChange={e => update("country", e.target.value)} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: "8px", padding: "12px 16px", width: "100%", fontSize: "15px" }}>
                <option value="NG">🇳🇬 Nigeria</option>
                <option value="GH">🇬🇭 Ghana</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>Password</label>
              <input type="password" value={form.password} onChange={e => update("password", e.target.value)} placeholder="Min. 8 characters" required />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", marginTop: "8px" }}>
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "14px", color: "var(--text-secondary)" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--accent-green)", textDecoration: "none", fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
