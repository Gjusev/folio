import Link from "next/link";

export function Wordmark({ href = "/projects" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="font-serif text-xl tracking-tight text-ink"
      aria-label="Folio, inicio"
    >
      Folio<span className="text-accent">.</span>
    </Link>
  );
}
