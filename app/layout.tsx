import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GroSuite Field | Field team operations",
  description:
    "Your team, in view. Live locations, attendance and field tasks in one workspace.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
