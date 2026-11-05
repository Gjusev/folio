"use client";

import { useI18n } from "@/lib/i18n/client";
import { usePreferences } from "@/components/PreferencesProvider";

/** One row of mutually exclusive options; the active one is pressed. */
function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={legend}
      className="inline-flex overflow-hidden rounded-md border border-line bg-surface"
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={`h-8 px-3 text-sm whitespace-nowrap transition-colors ${
            i > 0 ? "border-l border-line" : ""
          } ${
            value === o.value
              ? "bg-active font-medium text-ink"
              : "text-muted hover:bg-raised hover:text-ink"
          }`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Appearance section of the settings page: theme, fonts and text scale.
 *  Every control applies optimistically through the preferences provider. */
export function AppearanceSettings() {
  const { t } = useI18n();
  const { appearance, setAppearance } = usePreferences();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("settings.appearance.title")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("settings.appearance.desc")}</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="label">{t("settings.appearance.theme")}</span>
          <Segmented
            legend={t("settings.appearance.theme")}
            value={appearance.theme}
            options={[
              { value: "system", label: t("settings.appearance.theme.system") },
              { value: "light", label: t("settings.appearance.theme.light") },
              { value: "dark", label: t("settings.appearance.theme.dark") },
            ]}
            onChange={(theme) => setAppearance({ theme })}
          />
        </div>

        <div className="space-y-1.5">
          <span className="label">{t("settings.appearance.uiFont")}</span>
          <Segmented
            legend={t("settings.appearance.uiFont")}
            value={appearance.uiFont}
            options={[
              { value: "plex", label: t("settings.appearance.uiFont.plex") },
              { value: "switzer", label: t("settings.appearance.uiFont.switzer") },
              { value: "system", label: t("settings.appearance.uiFont.system") },
            ]}
            onChange={(uiFont) => setAppearance({ uiFont })}
          />
        </div>

        <div className="space-y-1.5">
          <span className="label">{t("settings.appearance.size")}</span>
          <Segmented
            legend={t("settings.appearance.size")}
            value={appearance.fontScale}
            options={[
              { value: "s", label: t("settings.appearance.size.s") },
              { value: "m", label: t("settings.appearance.size.m") },
              { value: "l", label: t("settings.appearance.size.l") },
            ]}
            onChange={(fontScale) => setAppearance({ fontScale })}
          />
        </div>

        <div className="space-y-1.5">
          <span className="label">{t("settings.appearance.editorFont")}</span>
          <Segmented
            legend={t("settings.appearance.editorFont")}
            value={appearance.editorFont}
            options={[
              { value: "plex-mono", label: t("settings.appearance.editorFont.plexMono") },
              { value: "system-mono", label: t("settings.appearance.editorFont.systemMono") },
            ]}
            onChange={(editorFont) => setAppearance({ editorFont })}
          />
        </div>
      </div>
    </section>
  );
}
