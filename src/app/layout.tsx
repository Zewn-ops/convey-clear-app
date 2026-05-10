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
    <html lang="en">
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
