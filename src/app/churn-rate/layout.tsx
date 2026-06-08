import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tingkat Churn | Dashboard VP Sales",
};

export default function ChurnRateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
