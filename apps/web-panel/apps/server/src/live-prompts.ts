const visualDisplayPattern = /(?:poka(?:ż|z|zać|zac)|wyświetl|wyswietl|zaprezentuj|zobaczy(?:ć|c)|ekran|tablet|canvas|wykres|zdjęci|zdjeci|obraz|temperatur|co2)/iu;
const presentationRequestPattern = /(?:opowiedz|powiedz\s+(?:mi\s+)?(?:coś|cos)|co\s+wiesz|informacj|ciekawostk)/iu;
const visualSubjectPattern = /(?:ras(?:a|ach|ie|y)?|zwierz|kot|ps(?:a|ie|y)|planet|merkury|wenus|ziemi|mars|jowisz|saturn|uran|neptun|słoń|slon|księżyc|ksiezyc|gwiazd|galakty|kraj|miast|miejsce|zabyt|budowl|architektur|roślin|roslin|samoch|pojazd|produkt|potraw|danie|malar|rzeźb|rzezb|mod(?:a|zie)|histori)/iu;

// Tool arguments count against the delegated response output budget. A complete
// Canvas document with citations is routinely larger than the old 500-token cap.
export const LIVE_DELEGATION_MAX_OUTPUT_TOKENS = 3_000;

export const visualDelegationInstruction = "Użytkownik poprosił o pokazanie informacji na fizycznym ekranie tabletu WallDeck. Obowiązkowo deleguj tę prośbę do backendu. Nie odpowiadaj, że nie możesz nic wyświetlić ani że możesz tylko opisać. Backend ma narzędzie show_assistant_canvas i przygotuje ekran.";

export function needsVisualDelegation(text: string) {
  return visualDisplayPattern.test(text) || (presentationRequestPattern.test(text) && visualSubjectPattern.test(text));
}

export function liveConversationInstructions(base: string) {
  return `${base}
Język i styl: Rozmawiaj wyłącznie po polsku, naturalnie i zwięźle. Odpowiadaj głosem bezpośrednio na zwykłe pytania i swobodną rozmowę. Jeżeli startowy input kończy się wiadomością użytkownika, odpowiedz na nią natychmiast po uruchomieniu sesji.
Backchannel policy: Nie deleguj prostych odpowiedzi, powitań, dowcipów ani krótkich wyjaśnień. Możesz krótko powiedzieć, że sprawdzasz, gdy backend rzeczywiście pracuje. Gdy użytkownik prosi, aby opowiedzieć o konkretnym temacie, który zyska na zdjęciu i uporządkowanych faktach — na przykład rasie zwierzęcia, miejscu, planecie, roślinie, pojeździe, dziele lub potrawie — preferuj delegację i prezentację Canvas nawet bez słowa „pokaż”.
Progress policy: Zanim rozpoczniesz delegację albo narzędzie, które prawdopodobnie potrwa dłużej niż 2 sekundy, natychmiast wypowiedz jedno krótkie, naturalne zdanie dopasowane do polecenia, maksymalnie 8 słów, np. „Już to sprawdzam”. Następnie od razu wykonaj działanie. Nie czekaj z komunikatem na wynik, nie powtarzaj go i nie ogłaszaj jeszcze sukcesu.
Interruption policy: Słuchaj także podczas mówienia. Gdy użytkownik zacznie mówić lub Cię poprawi, przerwij obecną wypowiedź, wysłuchaj go i odpowiedz na najnowszą intencję.
Delegation policy: Deleguj do backendu zadania wymagające narzędzi WallDeck/MCP, Spotify, Home Assistant, aktualnych danych, działania w systemie, pamięci albo wyraźnie trudniejszego rozumowania. Masz fizyczny ekran tabletu WallDeck. Każda prośba typu „pokaż”, „wyświetl”, „pokaż na ekranie/tablecie”, prośba o Canvas, obraz, zdjęcie, wykres albo zestawienie temperatur/CO₂ wymaga delegacji, nawet gdy sam znasz odpowiedź. Backend potrafi wyświetlić wynik przez show_assistant_canvas. Nigdy nie twierdź, że nie możesz nic pokazać. Po otrzymaniu wyniku delegacji przedstaw go naturalnie użytkownikowi.
Music policy: Prośba typu „wybierz mi muzykę do nauki i puść” jest kompletna: deleguj wybór oraz uruchomienie Spotify bez pytania o konkretną playlistę. Nigdy nie twierdź, że wykonujesz lub wykonałeś akcję, jeśli nie utworzyłeś delegacji i nie otrzymałeś jej wyniku.`;
}

export function liveBackendInstructions(base: string) {
  return `${base}
Jesteś backendem narzędziowym rozmowy głosowej. Masz pełny kontekst rozmowy. Wykonuj proste, zatwierdzone działania od razu. Krótkie odpowiedzi typu „tak” interpretuj w kontekście ostatniego pytania asystenta. Raportuj sukces dopiero po potwierdzeniu narzędzia.
Jeżeli użytkownik prosi, aby coś pokazać, wyświetlić lub zaprezentować na tablecie, obowiązkowo zakończ zadanie wywołaniem show_assistant_canvas. Nie odpowiadaj samym opisem. Gdy delegacja dotyczy opowieści o konkretnym wizualnym temacie, sam przygotuj krótką prezentację Canvas: trafny tytuł, zwięzłe streszczenie, kilka ciekawostek, zdjęcia i źródła. Aktualne odpowiedzi internetowe najpierw sprawdzaj przez web_search lub search_web, a potem pokaż w Canvas z prawdziwymi źródłami i dostępnymi obrazami. Dla prezentacji wizualnego tematu oraz jawnej prośby o zdjęcie użyj search_web z includeImages=true i przekaż dokładnie zwrócone images do Canvas. Nie twierdź, że zdjęcie zostało pokazane, jeżeli images jest puste. Zestawienia wielu temperatur, CO₂ i innych encji Home Assistant pokazuj w Canvas jako duże metrics oraz wykres porównawczy. Nie wymyślaj adresów URL ani wartości encji.`;
}
