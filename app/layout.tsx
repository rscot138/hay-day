import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hay Windows — Know If Today Is a Hay Day",
  description: "Field-specific hay cutting decisions powered by live weather data. Free, no account needed."
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
