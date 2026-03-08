import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/context/AuthContext";
import { SettingsProvider } from "@/context/SettingsContext";
import ProtectedRoute from "@/components/ProtectedRoute";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Bakery MRP",
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
        {/* AuthProvider must wrap everything so ProtectedRoute and Navbar
            can both call useAuth() to read the logged-in user. */}
        <AuthProvider>
          {/* SettingsProvider sits inside AuthProvider so it can access the
              current user if needed later, but outside ProtectedRoute so
              settings load in parallel with the auth check. */}
          <SettingsProvider>
            <Navbar />
            {/* ProtectedRoute checks auth on every navigation.
                It renders children only when the user is logged in
                (or when the current page is /login). */}
            <ProtectedRoute>
              {children}
            </ProtectedRoute>
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
