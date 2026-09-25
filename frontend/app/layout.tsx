import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Build3D - print-on-demand order tracking",
  description:
    "Operator console for a print-on-demand shop: order state machine, audit trail and live quoting.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-screen bg-[var(--page)] text-[var(--text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
