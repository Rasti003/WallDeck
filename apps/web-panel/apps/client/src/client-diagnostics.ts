export function reportClientError(title: string, message: string, details?: string) {
  const body = JSON.stringify({ level: "error", category: "client", title, message, ...(details ? { details } : {}) });
  void fetch("/api/diagnostics/client", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

export function installClientDiagnostics() {
  window.addEventListener("error", event => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const source = target instanceof HTMLImageElement ? target.currentSrc : target instanceof HTMLScriptElement ? target.src : "zasób interfejsu";
      reportClientError("Nie udało się wczytać zasobu", source);
      return;
    }
    reportClientError("Błąd interfejsu", event.message || "Nieznany błąd JavaScript", event.error instanceof Error ? event.error.stack : undefined);
  }, true);
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportClientError("Nieobsłużony błąd interfejsu", reason.message, reason.stack);
  });
}
