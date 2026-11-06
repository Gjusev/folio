import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = { title: "Datenschutzerklärung" };

// Datenschutzerklärung der gehosteten Demo-Instanz, aufgestellt nach den
// tatsächlichen Verarbeitungen im Code (Konten, Sessions, SMTP, serverseitige
// Metadatensuchen). Platzhalter in <mark> ergänzt der Betreiber.
export default function DatenschutzPage() {
  return (
    <LegalPage
      title="Datenschutzerklärung"
      back="Zurück zu Folio"
      updated="Stand: 6. November 2026"
    >
      <p className="lp-doc-lead">
        Diese Erklärung beschreibt, welche personenbezogenen Daten die öffentliche Demo-Instanz von
        Folio verarbeitet, auf welcher Rechtsgrundlage — und was hier ausdrücklich <em>nicht</em>{" "}
        passiert.
      </p>
      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlich für die Datenverarbeitung auf dieser Website ist:
        <br />
        <strong>Mokka Agentur</strong>
        <br />
        <mark className="lp-ph">Straße und Hausnummer, PLZ Ort</mark>
        <br />
        E-Mail:{" "}
        <a className="lp-link" href="mailto:info@mokka-agentur.de">
          info@mokka-agentur.de
        </a>
      </p>

      <h2>2. Diese Instanz</h2>
      <p>
        Dies ist eine öffentliche Demo-Instanz des selbst gehosteten LaTeX-Editors Folio. Alle
        Inhalte — LaTeX-Quellen, PDFs, Bibliografien, Kommentare, Versionen — liegen in einer
        eigenen PostgreSQL-Datenbank <em>auf diesem Server</em>, nicht bei einem Drittanbieter.
      </p>
      <p>
        Es gibt kein Tracking und keine Analysewerkzeuge. Die Demo kann jederzeit zurückgesetzt
        werden; speichere wichtige Arbeiten nicht ausschließlich hier.
      </p>

      <h2>3. Verarbeitungen</h2>
      <h3>Konto</h3>
      <p>
        Für ein Konto verarbeiten wir Name, E-Mail-Adresse und ein Passwort. Das Passwort wird mit
        scrypt (OWASP-Parameter) gehasht gespeichert, niemals im Klartext. Rechtsgrundlage: Art. 6
        Abs. 1 lit. b DSGVO (Vertrag). Ohne Konto kann Folio nicht genutzt werden.
      </p>
      <h3>Sitzung (Anmeldung)</h3>
      <p>
        Nach der Anmeldung setzt Folio ein HttpOnly-Cookie (<code>folio_session</code>), das die
        Sitzung erhält. Der Token wird nur als SHA-256-Hash gespeichert. Rechtsgrundlage: Art. 6
        Abs. 1 lit. f DSGVO (Sicherheit des Betriebes); als Cookie ist es nach § 25 Abs. 2 TDDDG
        zulässig, weil es für den von dir ausdrücklich gewünschten Dienst zwingend erforderlich ist.
      </p>
      <h3>Sprache</h3>
      <p>
        Das Cookie <code>folio_lang</code> speichert deine Sprachwahl (ein Jahr). Es wird nur
        gesetzt, wenn du die Sprache selbst umstellst — ebenfalls § 25 Abs. 2 TDDDG.
      </p>
      <h3>Passwort-Zurücksetzung und Einladungen</h3>
      <p>
        Für Zurücksetzungen und Projekt-Einladungen versenden wir E-Mails über einen eigenen
        SMTP-Account (netcup, Serverstandort Deutschland). Reset-Tokens sind einmal nutzbar, 30
        Minuten gültig und nur als Hash gespeichert. Rechtsgrundlage: Art. 6 Abs. 1 lit. b bzw. f
        DSGVO.
      </p>
      <h3>Literatursuche</h3>
      <p>
        Die Suche fragt freie Metadaten-Quellen (OpenAlex, Semantic Scholar, arXiv, Crossref){" "}
        <em>serverseitig</em> ab. An diese Dienste gehen Suchbegriffe und allgemeine
        Client-Kennungen — keine Inhalte deiner Dokumente und keine Kontodaten. Rechtsgrundlage:
        Art. 6 Abs. 1 lit. b DSGVO (vertragsnotwendige Funktion).
      </p>
      <h3>KI-Funktionen</h3>
      <p>
        KI-Modelle werden nur angerufen, wenn ein Anbieter konfiguriert ist. Server-weite Zugänge
        werden auf dieser Instanz nicht geteilt; Nutzer können eigene Schlüssel hinterlegen. Diese
        werden verschlüsselt (AES-256-GCM) auf dem Server gespeichert.
      </p>
      <p>
        Zur Ausführung deiner eigenen Anfrage werden die von dir beteiligten Textauszüge an den von
        dir gewählten Anbieter übermittelt — der Anbieter sieht genau diese Auszüge, nichts Weiteres
        aus deinem Projekt.
      </p>
      <h3>Server-Logfiles</h3>
      <p>
        Der Hoster (netcup GmbH, Gütersloh, Deutschland) erhebt Verbindungsdaten (IP, Zeitpunkt,
        abgerufene Ressource) zur Sicherung des Betriebs; Rechtsgrundlage Art. 6 Abs. 1 lit. f
        DSGVO. Wir werten sie nicht werblich aus.
      </p>

      <h2>4. Cookies — und warum es keinen Cookie-Banner gibt</h2>
      <p>
        Folio setzt ausschließlich die beiden funktionalen Cookies aus Abschnitt 3 (
        <code>folio_session</code>, <code>folio_lang</code>): keine Statistik, kein Marketing, keine
        Drittanbieter-Cookies, keine externen Einbettungen.
      </p>
      <p>
        Nach § 25 Abs. 2 TDDDG sind beide ohne Einwilligung zulässig — deshalb gibt es hier keinen
        Cookie-Banner. Die Videos sind selbst gehostet und stumm geschaltet, bis du sie abspielst.
      </p>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Zweck</th>
            <th>Dauer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>folio_session</code>
            </td>
            <td>Anmeldung (HttpOnly, SameSite=lax)</td>
            <td>bis zur Abmeldung</td>
          </tr>
          <tr>
            <td>
              <code>folio_lang</code>
            </td>
            <td>gespeicherte Sprache</td>
            <td>1 Jahr</td>
          </tr>
        </tbody>
      </table>

      <h2>5. Speicherdauer</h2>
      <p>
        Kontodaten und Projektinhalte: bis zur Löschung deines Kontos bzw. des Projekts.
        Reset-Tokens: 30 Minuten. Server-Logfiles: gemäß den Vorgaben des Hosters.
      </p>

      <h2>6. Auftragsverarbeiter und Empfänger</h2>
      <p>
        Hosting: netcup GmbH (Deutschland). Metadaten-APIs: OpenAlex (OurResearch), Semantic Scholar
        (Allen Institute for AI), arXiv (Cornell University), Crossref — jeweils nur die
        serverseitigen Suchanfragen aus Abschnitt 3.
      </p>
      <p>
        KI-Anbieter: ausschließlich die von dir selbst konfigurierten. Eine Weitergabe oder ein
        Verkauf von Daten findet nicht statt.
      </p>

      <h2>7. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch
        (Art. 21 DSGVO) sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren
        (Art. 77 DSGVO).
      </p>
      <p>
        Für Auskünfte und Löschung genügt eine E-Mail an{" "}
        <a className="lp-link" href="mailto:info@mokka-agentur.de">
          info@mokka-agentur.de
        </a>
        .
      </p>

      <h2>8. Verschlüsselung</h2>
      <p>Die Übertragung erfolgt ausschließlich über TLS (Let&apos;s Encrypt).</p>
    </LegalPage>
  );
}
