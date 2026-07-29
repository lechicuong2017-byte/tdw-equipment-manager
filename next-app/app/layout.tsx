import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TDW Equipment Manager",
    template: "%s · TDW Equipment Manager",
  },
  description: "Quản lý thiết bị, bảo trì và tài sản nội bộ TDW.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
