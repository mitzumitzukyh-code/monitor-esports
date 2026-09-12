import './globals.css';

export const metadata = {
  title: 'Mitzu Esports · Predicciones verificables',
  description: 'Probabilidades de esports calculadas con modelos estadísticos y auditadas contra resultados reales.',
  icons: { icon: '/assets/favicon.ico' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
