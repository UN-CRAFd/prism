import type { Metadata } from "next";
import localFont from "next/font/local";
import { Roboto } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { getLabelOverrides } from "@/lib/label-settings";
import { applyLabelOverrides } from "@/lib/labels";
import { getOptionOverrides } from "@/lib/option-settings";
import { applyOptionOverrides } from "@/lib/options";

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

// Rendered per-request so admin label overrides (read from the DB in the layout
// below) are always current — otherwise statically-prerendered pages would bake
// in the build-time labels and never reflect changes.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRAF'd | PRISM",
  description:
    "Complex Risk Analytics Fund'd - Partner Reporting & Administration Platform",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Load admin label overrides once per full page render: patch the server-side
  // labels singleton (for SSR) and inject the same overrides as a global so the
  // client patches its copy before hydration — server and client render match.
  const [labelOverrides, optionOverrides] = await Promise.all([
    getLabelOverrides(),
    getOptionOverrides(),
  ]);
  applyLabelOverrides(labelOverrides);
  applyOptionOverrides(optionOverrides);
  const hasLabelOverrides = Object.keys(labelOverrides).length > 0;
  const hasOptionOverrides = Object.keys(optionOverrides).length > 0;

  return (
    <html lang="en" className={`${qanelas.variable} ${roboto.variable}`}>
      <body className="antialiased font-roboto">
        {hasLabelOverrides && (
          <script
            // Runs at HTML parse time, before the app bundle evaluates labels.ts.
            // `<` is escaped so the JSON can never break out of the script tag.
            dangerouslySetInnerHTML={{
              __html: `window.__LABEL_OVERRIDES__=${JSON.stringify(labelOverrides).replace(/</g, "\\u003c")}`,
            }}
          />
        )}
        {hasOptionOverrides && (
          <script
            // Same pre-hydration trick for dropdown options (see lib/options.ts).
            dangerouslySetInnerHTML={{
              __html: `window.__OPTION_OVERRIDES__=${JSON.stringify(optionOverrides).replace(/</g, "\\u003c")}`,
            }}
          />
        )}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
