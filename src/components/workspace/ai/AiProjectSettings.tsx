import { useState } from "react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";

export type AiPolicy = "any" | "local" | "off";

const POLICY_KEY: Record<AiPolicy, MsgKey> = {
  any: "ai.policy.any",
  local: "ai.policy.local",
  off: "ai.policy.off",
};

/**
 * Who may send this manuscript to AI. The owner chooses; the server enforces
 * it for every collaborator's own key (including retrieval embeddings).
 */
export function AiPolicyControl({
  projectId,
  policy,
  isOwner,
  onChange,
}: {
  projectId: string;
  policy: AiPolicy;
  isOwner: boolean;
  onChange: (p: AiPolicy) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(next: AiPolicy) {
    setSaving(true);
    setError(null);
    try {
      await api("PATCH", `/api/projects/${projectId}`, { aiPolicy: next });
      onChange(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1 text-xs" data-testid="ai-policy">
      <label className="flex flex-wrap items-center gap-2">
        <span className="label">{t("ai.policy.title")}</span>
        {isOwner ? (
          <select
            className="select h-7 text-xs"
            value={policy}
            disabled={saving}
            onChange={(e) => void save(e.target.value as AiPolicy)}
          >
            {(Object.keys(POLICY_KEY) as AiPolicy[]).map((p) => (
              <option key={p} value={p}>
                {t(POLICY_KEY[p])}
              </option>
            ))}
          </select>
        ) : (
          <span>{t(POLICY_KEY[policy])}</span>
        )}
      </label>
      <p className="leading-4 text-muted">
        {isOwner ? t("ai.policy.desc") : t("ai.policy.ownerOnly")}
      </p>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

type Disclosure = {
  latex: string | null;
  purposes?: string[];
  models?: string[];
  from?: string;
  to?: string;
  count?: number;
};

/**
 * The AI-use declaration journals ask for, written from the project's ledger
 * of AI use inside Folio. A proposal like any other: the author inserts it.
 */
export function DisclosureCard({
  projectId,
  onInsert,
}: {
  projectId: string;
  onInsert: (latex: string) => void;
}) {
  const { t } = useI18n();
  const [lang, setLang] = useState<"en" | "es" | "de">("en");
  const [data, setData] = useState<Disclosure | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load(l: typeof lang) {
    setBusy(true);
    setError(null);
    try {
      setData(await api<Disclosure>("GET", `/api/projects/${projectId}/ai/disclosure?lang=${l}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5 text-xs" data-testid="ai-disclosure">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">{t("ai.disclosure.title")}</span>
        <select
          className="select h-7 text-xs"
          value={lang}
          aria-label={t("ai.disclosure.lang")}
          onChange={(e) => {
            const l = e.target.value as typeof lang;
            setLang(l);
            if (data) void load(l);
          }}
        >
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
        </select>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => void load(lang)}
        >
          {busy ? t("ai.disclosure.busy") : t("ai.disclosure.run")}
        </button>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {data && !data.latex && <p className="text-muted">{t("ai.disclosure.empty")}</p>}
      {data?.latex && (
        <>
          <pre className="max-h-40 overflow-auto rounded-md border border-line bg-raised p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap">
            {data.latex}
          </pre>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onInsert(data.latex!)}
            >
              {t("ai.insertAtCursor")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(data.latex!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t("figure.copied") : t("ai.copy")}
            </button>
          </div>
          <p className="leading-4 text-muted">{t("ai.disclosure.note")}</p>
        </>
      )}
    </div>
  );
}
