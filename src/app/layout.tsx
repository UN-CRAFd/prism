import type { Metadata } from "next";
import localFont from "next/font/local";
import { Roboto } from "next/font/google";
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

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRAF'd | PRISM",
  description:
    "Complex Risk Analytics Fund'd - Partner Reporting & Administration Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${qanelas.variable} ${roboto.variable}`}>
      <body className="antialiased font-roboto">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
