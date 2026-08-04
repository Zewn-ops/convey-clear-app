import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ConveyClear — Client Portal",
  description:
    "Secure client portal for ConveyClear property conveyancing services",
  keywords: ["conveyancing", "property", "FICA", "South Africa"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Resolves the theme before first paint. Without this the page renders
          light, then swaps to dark once React hydrates, which reads as a bug.
          Deliberately inline and blocking: it must run before the body paints,
          and it is small enough that the cost is invisible.

          Stored preference wins; otherwise the OS preference is left to the
          media query in tokens.css, so we set no attribute at all.

          On dangerouslySetInnerHTML: the string below is a hardcoded literal
          with no interpolation and no request, user or database data anywhere
          in it. Nothing untrusted can reach it, so there is no XSS surface.
          Static-analysis tools flag this API on sight; this is the one pattern
          where it is the correct answer, because the script must execute before
          the body paints and React cannot do that from a component.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("cc-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: "10px",
              fontSize: "14px",
            },
            success: {
              iconTheme: { primary: "#1B2E6B", secondary: "#fff" },
            },
          }}
        />
      </body>
    </html>
  );
}
