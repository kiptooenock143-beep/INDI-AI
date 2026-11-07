const STORAGE_KEY = "exile.venom-mode";
const CHANGE_EVENT = "exile:venom-mode-changed";

export function isVenomModeEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined"
      && localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setVenomModeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail: { enabled } }),
      );
    }
  } catch {
    // Keep the app usable if browser storage is unavailable.
  }
}

export function onVenomModeChanged(
  callback: (enabled: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
    callback(typeof detail?.enabled === "boolean"
      ? detail.enabled
      : isVenomModeEnabled());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback(isVenomModeEnabled());
  };

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}
