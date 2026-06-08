import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Layanan Baru | Dashboard VP Sales",
};

export default function NewServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
