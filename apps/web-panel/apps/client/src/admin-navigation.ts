export const adminSections = [
  { id: "overview", group: "Przegląd", label: "Pulpit", icon: "⌂", description: "Stan panelu i szybki dostęp do konfiguracji.", keywords: "start status" },
  { id: "views", group: "Panel tabletu", label: "Ekrany i menu", icon: "▦", description: "Wybierz aktywny ekran i uporządkuj menu tabletu.", keywords: "widoki kolejność" },
  { id: "rules", group: "Panel tabletu", label: "Gesty i automatyzacje", icon: "⇄", description: "Zachowanie po dotknięciu, gestach i bezczynności.", keywords: "reguły powrót czas" },
  { id: "photos", group: "Panel tabletu", label: "Biblioteka zdjęć", icon: "▧", description: "Synchronizacja albumu, kadrowanie i widoczność zdjęć.", keywords: "album google kolekcja zdjęcia fotografie" },
  { id: "display", group: "Panel tabletu", label: "Wygląd ramki", icon: "◫", description: "Jasność, tempo pokazu, zegar i pogoda.", keywords: "overlay lokalizacja data przejście" },
  { id: "music", group: "Panel tabletu", label: "Muzyka · Spotify", icon: "♫", description: "Połączenie Spotify i ustawienia widoku muzyki.", keywords: "dźwięk multimedia" },
  { id: "notifications", group: "Panel tabletu", label: "Powiadomienia", icon: "◇", description: "Komunikaty, alarmy i sposób ich prezentacji.", keywords: "alert" },
  { id: "ai", group: "Asystent", label: "Modele i instrukcje", icon: "✦", description: "Konfiguracja AI, klucz API i reguły eskalacji.", keywords: "openai luna prompt model" },
  { id: "voice", group: "Asystent", label: "Głos i nasłuch", icon: "≋", description: "GPT-Live, Luna, wake word i synteza mowy.", keywords: "mikrofon elevenlabs budżet tts mówca" },
  { id: "assistant", group: "Asystent", label: "Mimika i tryb nocny", icon: "◌", description: "Jasność twarzy, poszczególnych min i sen po zmroku.", keywords: "twarz światło kamera sensor sen" },
  { id: "console", group: "Asystent", label: "Konsola testowa", icon: "›_", description: "Wyślij polecenie i sprawdź odpowiedź asystenta.", keywords: "tekst test" },
  { id: "history", group: "Asystent", label: "Historia rozmów", icon: "◷", description: "Ostatnie rozmowy, wyniki narzędzi i diagnostyka błędów.", keywords: "logi transkrypcja" },
  { id: "mcp", group: "System", label: "Narzędzia i MCP", icon: "⌘", description: "Uprawnienia funkcji asystenta i zewnętrzny endpoint MCP.", keywords: "integracje api narzędzia" },
  { id: "ha", group: "System", label: "Home Assistant", icon: "⌂", description: "Połączenie z domem, dashboard i encje na zdjęciach.", keywords: "ha token sensory overlay" },
  { id: "device", group: "System", label: "Urządzenie", icon: "▯", description: "Stan tabletu, uprawnienia Androida i czujniki.", keywords: "bateria sensory diagnostyka" },
  { id: "diagnostics", group: "System", label: "Dziennik systemowy", icon: "≣", description: "Trwała historia błędów oraz aktywności tabletu.", keywords: "logi błędy zdarzenia aktywność tablet" },
  { id: "states", group: "System", label: "Mapa stanów", icon: "⋈", description: "Dokumentacja przejść i reguł działania panelu.", keywords: "diagnostyka stany przejścia" },
] as const;

export type AdminSection = typeof adminSections[number]["id"];
export function sectionFromPath(path: string): AdminSection {
  const id = path.replace(/^\/admin\/?/, "").replace(/\/$/, "");
  return adminSections.find(section => section.id === id)?.id ?? "overview";
}
export function sectionPath(section: AdminSection) { return section === "overview" ? "/admin" : `/admin/${section}`; }
export function matchingSections(query: string) {
  const normalize = (text: string) => text.toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
  const words = normalize(query).trim().split(/\s+/);
  return adminSections.filter(section => words.every(word => normalize(`${section.label} ${section.group} ${section.description} ${section.keywords}`).includes(word)));
}
