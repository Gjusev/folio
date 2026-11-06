import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum" back="Zurück zu Folio" updated="Stand: 6. November 2026">
      <p>Angaben gemäß § 5 DDG für die Demo-Instanz unter folio.mokka-agentur.de:</p>
      <p>
        <strong>Mokka Agentur GbR</strong>
        <br />
        vertreten durch die Gesellschafter
        <br />
        Youssef Ouhaghi Ahmian und Jasid Khalaf
        <br />
        Untere Wiesenstraße 32
        <br />
        57271 Hilchenbach
        <br />
        Deutschland
      </p>
      <h2>Kontakt</h2>
      <p>
        Telefon: +49 157 52987051
        <br />
        E-Mail:{" "}
        <a className="lp-link" href="mailto:info@mokka-agentur.de">
          info@mokka-agentur.de
        </a>
        <br />
        Web:{" "}
        <a className="lp-link" href="https://mokka-agentur.de" rel="noopener noreferrer">
          mokka-agentur.de
        </a>
      </p>
      <h2>Unternehmensdaten</h2>
      <p>
        Die Mokka Agentur GbR ist eine Gesellschaft bürgerlichen Rechts und nicht ins
        Handelsregister eingetragen. Eine Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG ist
        nicht vorhanden.
      </p>
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>Youssef Ouhaghi Ahmian, Anschrift wie oben.</p>
      <h2>EU-Streitschlichtung</h2>
      <p>
        Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
      <h2>Hosting</h2>
      <p>
        Diese Instanz läuft auf Servern der netcup GmbH, Gütersloh, Deutschland. Die Übertragung
        erfolgt ausschließlich über TLS. Das Erstausspielen des Zertifikats übernimmt der gleiche
        Server.
      </p>
      <h2>Hinweis zu dieser Instanz</h2>
      <p>
        Dies ist eine öffentliche Demo-Instanz von{" "}
        <a className="lp-link" href="https://github.com/Gjusev/folio">
          Folio
        </a>
        , dem selbst gehosteten LaTeX-Editor. Projekte, die hier erstellt werden, sind Arbeitsdaten
        der jeweiligen Konten und können bei Wartungen zurückgesetzt werden. Speichere wichtige
        Arbeiten bitte nicht ausschließlich hier — für ernsthafte Projekte hoste deine eigene
        Instanz (siehe Quick start im Repository).
      </p>
    </LegalPage>
  );
}
