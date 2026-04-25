"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store/auth.store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace("/login");
  }, [loading, firebaseUser, router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "32px", height: "32px", border: "2px solid var(--border)", borderTopColor: "var(--accent-green)", borderRadius: "50%" }} className="animate-spin-slow" />
      </div>
    );
  }

  if (!firebaseUser) return null;

  const navLinks = [
    { href: "/dashboard",             label: "Overview" },
    { href: "/dashboard/send",        label: "Send" },
    { href: "/dashboard/transactions", label: "History" },
  ];

  async function handleLogout() {
    await signOut(auth);
    toast.success("Signed out");
    router.push("/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Top nav */}
      <nav style={{
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "60px", position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,8,8,0.9)", backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "18px", letterSpacing: "-0.02em" }}>
            <span style={{ color: "var(--accent-green)" }}>Africa</span>
            <span style={{ color: "var(--gh-gold)" }}>Pay</span>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {navLinks.map(link => (
              <Link key={link.href} href={link.href} style={{
                padding: "6px 14px", borderRadius: "6px", fontSize: "14px", fontWeight: 500,
                textDecoration: "none",
                color: pathname === link.href ? "var(--text-primary)" : "var(--text-secondary)",
                background: pathname === link.href ? "var(--bg-elevated)" : "transparent",
              }}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            {profile?.fullName ?? profile?.email ?? ""}
            <span style={{ marginLeft: "6px", padding: "2px 8px", borderRadius: "4px",
              background: profile?.country === "NG" ? "rgba(0,135,81,0.15)" : "rgba(207,9,33,0.15)",
              color: profile?.country === "NG" ? "#00e58a" : "#ff6b6b",
              fontSize: "11px", fontWeight: 600 }}>
              {profile?.country === "NG" ? "🇳🇬 NG" : "🇬🇭 GH"}
            </span>
          </span>
          <button onClick={handleLogout} className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: "13px" }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Page content */}
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 24px" }}>
        {children}
      </main>
    </div>
  );
}
