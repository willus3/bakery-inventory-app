import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Bakery Inventory",
  description: "Ingredient and finished goods inventory management",
};

// Root layout — wraps every page in the app.
// The Navbar is rendered here so it appears automatically on all routes
// without needing to import it in each individual page.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-50 min-h-screen`}
      >
        <Navbar />
        {children}
      </body>
    </html>
  );
}
