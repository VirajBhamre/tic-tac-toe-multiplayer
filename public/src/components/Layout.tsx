import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  subtitle?: string;
}

export function Layout({ children, subtitle }: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-kicker">Ranked multiplayer</p>
        <h1 className="app-title">
          <span className="app-title__main">Tic Tac Toe</span>
        </h1>
        {subtitle ? <p className="app-subtitle">{subtitle}</p> : null}
        <div className="app-header__rule" aria-hidden />
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <span>Server-authoritative</span>
      </footer>
    </div>
  );
}
