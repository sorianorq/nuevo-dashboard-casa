import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Finanzas Casa", template: "%s · Finanzas Casa" },
  description: "Contabilidad doméstica",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f5f0",
  viewportFit: "cover",
};

/**
 * Antes de pintar: si el usuario ocultó el menú lateral, se marca en <html>
 * (así no aparece un instante y luego se esconde). Ver SidebarToggle.
 */
const SIDEBAR_SCRIPT = `try{if(localStorage.getItem("fc-sidebar")==="closed")document.documentElement.dataset.sidebar="closed"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${manrope.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
