import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hay Decision Engine",
  description: "Real-time cut, ted, and bale decisions for hay fields."
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
