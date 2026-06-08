import type { Metadata } from "next";
import "@fontsource-variable/roboto";
import "./globals.css";
import MUIThemeProvider from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Dashboard VP Sales",
  description: "Sistem pelaporan Dashboard Penjualan & Operasional.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <MUIThemeProvider>
          {children}
        </MUIThemeProvider>
      </body>
    </html>
  );
}

