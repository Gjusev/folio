import { useEffect, useState, useSyncExternalStore } from "react";
import { DocumentStore, type FileDoc } from "./document-store";

export type { FileDoc, SaveStatus } from "./document-store";

export function useDocuments(projectId: string, initial: FileDoc[]) {
  const [store] = useState(() => new DocumentStore(projectId, initial));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (store.hasUnsaved()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [store]);

  return { ...snapshot, store };
}
