export function scheduledTaskPrompt(label: string, instruction: string, kind: "task" | "timer" | "alarm") {
  const context = kind === "task"
    ? `Nadszedł termin zaplanowanego zadania asystenta „${label}”.`
    : `Właśnie wybił ${kind === "timer" ? "minutnik" : "budzik"} „${label}”.`;
  return `${context}
Wykonaj teraz zapisaną instrukcję: ${instruction}

To zadanie działa w tle. Samodzielnie dobierz potrzebne narzędzia i wykonaj polecenie, zamiast tylko opisywać zamiar.
Domyślnie działaj cicho. Użyj send_notification, gdy użytkownik powinien zobaczyć komunikat na tablecie. Użyj speak_on_tablet tylko wtedy, gdy komunikat powinien wyraźnie zwrócić uwagę głosem. Użyj start_live_conversation wyłącznie wtedy, gdy naprawdę potrzebujesz odpowiedzi użytkownika lub dalszej rozmowy; nie uruchamiaj GPT-Live do jednostronnego komunikatu.
Jeśli rozpoczynasz rozmowę, najpierw wykonaj wszystkie możliwe działania w tle, a wiadomość otwierająca ma jasno powiedzieć, czego potrzebujesz od użytkownika.`;
}
