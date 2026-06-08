import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Layanan Aktif | Dashboard VP Sales",
};

export default function TotalServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
