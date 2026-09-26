import type { ViewId, WallDeckSettings } from "@walldeck/contracts";
import { assistantStates, stateLabels, transientDelay, assistantTransition } from "./assistant/assistant-state";
import "./state-machines.css";

const names: Record<ViewId, string> = { photos: "Zdjęcia", ha: "Home Assistant", music: "Music", "assistant-expressive": "Asystent" };
type Row = [string, string, string];
function Machine({ title, rows }: { title: string; rows: Row[] }) {
  return <section className="admin-card state-machine"><h2>{title}</h2><div className="state-machine-scroll"><table><thead><tr><th>Stan / początek</th><th>Zdarzenie i warunek</th><th>Wynik</th></tr></thead><tbody>{rows.map(([from, event, to], i) => <tr key={i}><td>{from}</td><td>{event}</td><td>{to}</td></tr>)}</tbody></table></div></section>;
}
export function StateMachinesAdmin({ settings, currentView }: { settings: WallDeckSettings; currentView: ViewId }) {
  const { tapAction: tap, swipeDownAction: swipe, inactivityAction: idle } = settings.viewRouter;
  const night = settings.ambientSleep;
  const source = night.source === "home-assistant" ? `Encja HA: ${night.homeAssistantEntityId ?? "nie wybrano"}` : night.source === "camera" ? "Przednia kamera" : "Czujnik światła";
  const low = night.source === "home-assistant" ? night.homeAssistantSleepBelow : night.source === "camera" ? night.cameraSleepBelowPercent : night.sleepBelowLux;
  const high = night.source === "home-assistant" ? night.homeAssistantResetAbove : night.source === "camera" ? night.cameraResetAbovePercent : night.resetAboveLux;
  return <div className="state-machines">
    <section className="admin-card"><span className="admin-kicker">Mapa zachowania</span><h2>Co uruchamia kolejny ekran?</h2><p>Widok zgłoszony przez serwer: <strong>{names[currentView]}</strong>. To opis reguł, a nie podgląd bieżącego stanu odtwarzania czy animacji.</p><p>Czasy poniżej pochodzą z ustawień formularzy. Zmiany obowiązują na tablecie po zapisaniu w odpowiedniej zakładce. Stały czas powrotu z Music wynosi 30 sekund.</p></section>
    <Machine title="Widoki i gesty" rows={[
      ["Dowolny widok", `Gest w dół lub uchwyt · menu ${settings.tabletMenu.enabled ? "włączone" : "wyłączone"}`, "Menu widoków; wstrzymuje bezczynność i ma pierwszeństwo przed regułą gestu"],
      [names[tap.sourceView], `Dotknięcie · ${tap.enabled ? "włączone" : "wyłączone"}`, names[tap.targetView]],
      [names[swipe.sourceView], `Gest w dół od górnych 40% ekranu · ${swipe.enabled ? "włączony" : "wyłączony"}`, names[swipe.targetView]],
      [names[idle.sourceView], `${idle.seconds} s bezczynności · ${idle.enabled ? "włączone" : "wyłączone"}`, idle.sourceView === "ha" && idle.targetView === "photos" && idle.showAssistantIdleBeforePhotos ? `Idle (${idle.assistantIdleSeconds} s) → Zdjęcia` : names[idle.targetView]],
      ["Idle przed powrotem", "Dotknięcie", "Powrót do widoku źródłowego (Music lub reguła bezczynności)"],
      ["Dowolny widok", "Ręczne wywołanie widoku w adminie / przez API", "Wybrany widok"],
    ]} />
    <p>Music pomija ogólne reguły dotknięcia i gestu w dół. Sen ma własną regułę dotknięcia. Aktywność zeruje licznik bezczynności.</p>
    <Machine title="Music i odtwarzanie" rows={[
      ["Dowolny widok poza Music", "Spotify zgłasza rozpoczęcie odtwarzania lub pierwszy odczyt już grającego utworu", `Taniec (${idle.assistantIdleSeconds} s) → Music`],
      ["Music · gra", "Brak aktywności", "Pozostaje Music"],
      ["Music · nie gra", "30 s bezczynności", `Idle (${idle.assistantIdleSeconds} s) → Zdjęcia`],
      ["Music", "Przycisk Home", "Home Assistant"],
      ["HA otwarte z Music", `Bezczynność według aktywnej reguły HA, muzyka nadal gra`, `Taniec (${idle.assistantIdleSeconds} s) → Music`],
      ["Taniec przed Music", "Dotknięcie", "Natychmiast Music"],
      ["Taniec przed Music", "Koniec czasu, muzyka już nie gra", names[idle.targetView]],
      ["Idle przed zdjęciami", "Muzyka zaczyna grać", "Taniec → Music"],
      ["Odtwarzanie trwa", "Zmiana utworu / kolejna aktualizacja", "Bez ponownego przełączania widoku"],
    ]} />
    <Machine title="Połączenie Spotify" rows={[
      ["Rozłączono", "Zainstalowane Spotify i zapisany Client ID", "Ciche łączenie; ponowienie najwcześniej po 60 s"],
      ["Łączenie", "Połączenie przyjęte", "Połączono → obserwacja odtwarzania"],
      ["Łączenie", "Błąd lub 60 s bez odpowiedzi", "Błąd; ręczne Połącz ze Spotify w Music"],
      ["Połączono", "Utrata połączenia", "Rozłączono lub błąd subskrypcji"],
    ]} />
    <p>Obserwacja działa przez Spotify na tablecie. Samo opuszczenie Music nie zatrzymuje dźwięku. Historia wejścia z Music do HA jest zerowana po przeładowaniu panelu.</p>
    <Machine title={`Tryb nocny · ${night.enabled ? "włączony" : "wyłączony"}`} rows={[
      [source, `Wartość ≤ ${low}; kamera wymaga dodatkowo włączenia próbkowania`, `Idle (${night.sleepEntryDelaySeconds} s) → Sen`],
      ["Sen", "Dotknięcie", "Home Assistant"],
      [source, `Wartość ≥ ${high}`, "Ponowne uzbrojenie progu; ze snu powrót do zdjęć"],
      ["Nieznana / niedostępna wartość HA", "Brak poprawnego pomiaru", "Bez zmiany widoku"],
    ]} />
    <Machine title="Stany animacji asystenta" rows={assistantStates.map(state => [stateLabels[state], transientDelay[state] ? `Po ${transientDelay[state]! / 1000} s` : "Bez automatycznego limitu czasu", stateLabels[assistantTransition(state, { type: "timeout" })]] as Row)} />
    <p>Wszystkie stany można wybrać w podglądzie asystenta. Taniec uruchomiony przez menedżer widoków trwa {idle.assistantIdleSeconds} s zamiast domyślnych 8 s. Słuchanie, myślenie i mówienie są obecnie stanami wizualnymi — nie oznaczają gotowego asystenta głosowego.</p>
    <Machine title="Album zdjęć" rows={[
      ["Pokaz slajdów", `Co ${settings.photoIntervalSeconds} s`, `Losowy kolejny układ; przejście ${settings.transitionSeconds} s`],
      ["Tablet poziomo", "Zdjęcie poziome / pionowe", "Jedno poziome / para pionowych, zależnie od dostępnych zdjęć"],
    ]} />
    <Machine title="Tablet i zasilanie" rows={[
      ["WallDeck w tle", "Podłączenie zasilania", "Próba otwarcia WallDeck zgodnie z uprawnieniami Androida"],
      ["WallDeck na ekranie", "Odłączenie zasilania", "Zamknięcie Activity i powrót do poprzedniej aplikacji, jeśli dostępna"],
      ["Zmiana widoku / stanu asystenta", "Zastosowanie konfiguracji jasności", "Jasność okna dla wybranego widoku / stanu"],
    ]} />
  </div>;
}
