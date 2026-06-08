import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Total Pendapatan | Dashboard VP Sales",
};

export default function TotalRevenueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
