"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

export function LogoutButton() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        await api("POST", "/api/auth/logout").catch(() => undefined);
        router.replace("/login");
        router.refresh();
      }}
    >
      {t("auth.logout")}
    </button>
  );
}
