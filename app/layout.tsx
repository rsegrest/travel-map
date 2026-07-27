import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel Map",
  description: "A personal travel map for countries, territories, states, and cities."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
