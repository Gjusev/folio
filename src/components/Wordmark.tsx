import Link from "next/link";
import { Logo } from "./Logo";

export function Wordmark({ href = "/projects" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center text-ink" aria-label="Folio, home">
      <Logo className="h-[22px] w-auto" />
    </Link>
  );
}
