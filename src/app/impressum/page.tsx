import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = { title: "Impressum" };

// German legal page for the hosted demo instance. Values in <mark> are
// placeholders the operator must replace with the real legal details.
export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum" back="Zurück zu Folio" updated="Stand: 6. November 2026">
      <p>Angaben gemäß § 5 DDG für die Demo-Instanz unter folio.mokka-agentur.de:</p>
      <p>Angaben gemäß § 5 DDG für die Demo-Instanz unter folio.mokka-agentur.de:</p>
      <p>
        <strong>Mokka Agentur</strong>
        <br />
        <mark className="lp-ph">Rechtsform (z. B. Einzelunternehmen / GmbH)</mark>
        <br />
        <mark className="lp-ph">Straße und Hausnummer</mark>
        <br />
        <mark className="lp-ph">PLZ und Ort</mark>
        <br />
        Deutschland
      </p>
      <h2>Kontakt</h2>
      <p>
        E-Mail:{" "}
        <a className="lp-link" href="mailto:info@mokka-agentur.de">
          info@mokka-agentur.de
        </a>
        <br />
        <mark className="lp-ph">Telefon (optional)</mark>
      </p>
      <h2>Umsatzsteuer</h2>
      <p>
        USt-IdNr. gemäß § 27a UStG:{" "}
        <mark className="lp-ph">falls vorhanden, sonst diesen Absatz löschen</mark>
      </p>
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>
        <mark className="lp-ph">Name und Anschrift wie oben</mark>
      </p>
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
