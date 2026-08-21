import type { Metadata } from "next";
import "./globals.css";
import { PostHogProvider } from "@/app/lib/analytics";

export const metadata: Metadata = {
  title: "Hay Day — Know If Today Is a Hay Day",
  description: "Field-specific hay cutting decisions powered by live weather data. Free, no account needed."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
