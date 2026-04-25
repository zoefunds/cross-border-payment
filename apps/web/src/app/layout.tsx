import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfricaPay — Nigeria ↔ Ghana Payments",
  description: "Fast, borderless payments between Nigeria and Ghana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#0f0f0f",
                color: "#f5f5f5",
                border: "1px solid #2a2a2a",
                borderRadius: "8px",
                fontFamily: "DM Sans, sans-serif",
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
