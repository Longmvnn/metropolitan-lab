import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArchPlaza",
  description: "Courses, teaching resources and student progress across semesters.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [{url:"/favicon.svg?v=lime2",type:"image/svg+xml"},{url:"/favicon-32.png?v=lime2",sizes:"32x32",type:"image/png"},{url:"/favicon-192.png?v=lime2",sizes:"192x192",type:"image/png"},{url:"/favicon-512.png?v=lime2",sizes:"512x512",type:"image/png"}],
    shortcut: "/favicon-32.png?v=lime2",
    apple: "/favicon-192.png?v=lime2",
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
