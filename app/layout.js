import "./globals.css";

export const metadata = {
  title: "Portfolio Statistics",
  description:
    "Dashboard Next.js per analizzare ETF da JSON con performance storiche, transazioni e statistiche di portafoglio."
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
