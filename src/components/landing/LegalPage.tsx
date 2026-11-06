// Shell for the two German legal pages: same tokens as the landing (it owns
// landing.css), its header, and prose styling from .lp-doc. German only —
// these are the binding texts for the German-hosted instance.
import Link from "next/link";
import { Logo } from "@/components/Logo";
import "./landing.css";

export function LegalPage({
  title,
  kicker,
  back,
  updated,
  children,
}: {
  title: string;
  kicker?: string;
  back: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lp">
      <header className="lp-top">
        <Link href="/" className="lp-wordmark" aria-label="Folio">
          <Logo className="h-7 w-auto" />
        </Link>
        <nav className="lp-nav">
          <Link href="/" className="lp-link">
            {back}
          </Link>
        </nav>
        <div />
      </header>
      <main id="main">
        <article className="lp-doc">
          {kicker && <p className="lp-kick">{kicker}</p>}
          <h1 className="lp-h lp-doc-h">{title}</h1>
          <p className="lp-doc-upd">{updated}</p>
          {children}
        </article>
      </main>
    </div>
  );
}
