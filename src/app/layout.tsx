import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const qanelas = localFont({
  src: [
    { path: "../../public/fonts/QanelasHeavy.otf", weight: "700" },
    { path: "../../public/fonts/QanelasExtraBold.otf", weight: "800" },
    { path: "../../public/fonts/QanelasBlack.otf", weight: "900" },
  ],
  variable: "--font-qanelas",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRAF'd | Mosaic",
  description:
    "Complex Risk Analytics Fund'd - Partner Reporting & Administration Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={qanelas.variable}>
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
