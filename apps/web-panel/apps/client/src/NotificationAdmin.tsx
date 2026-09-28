import type { FormEvent } from "react";
import type { NotificationSound, WallDeckSettings } from "@walldeck/contracts";
import { notify } from "./Notifications";
import { api } from "./api";

const normalSounds: { value: NotificationSound; label: string }[] = [
  { value: "none", label: "Bez dźwięku" }, { value: "soft", label: "Delikatny sygnał" }, { value: "chime", label: "Dwa dźwięki" },
];
const alarmSounds: { value: NotificationSound; label: string }[] = [
  { value: "none", label: "Bez dźwięku" }, { value: "alarm", label: "Sygnał alarmowy" },
];

export function NotificationAdmin({ settings, setSettings, save, status }: { settings: WallDeckSettings; setSettings: (value: WallDeckSettings) => void; save: (event: FormEvent) => void; status: string }) {
  const update = (notifications: WallDeckSettings["notifications"]) => setSettings({ ...settings, notifications });
  const preview = (priority: "normal" | "alarm") => {
    const alarm = priority === "alarm";
    const sample = { priority, persistent: alarm ? settings.notifications.alarm.persistent : false,
      durationMs: (alarm ? settings.notifications.alarm.durationSeconds : settings.notifications.normal.durationSeconds) * 1000,
      sound: alarm ? settings.notifications.alarm.sound : settings.notifications.normal.sound, volume: settings.notifications.volume };
    void api.previewNotification(sample).catch(() => notify({ id: `admin-preview:${priority}:${Date.now()}`, message: alarm ? "Przykładowy alarm WallDeck" : "Przykładowe powiadomienie WallDeck", kind: alarm ? "error" : "info", ...sample }));
  };
  return <form className="admin-card admin-form notification-admin" onSubmit={save}>
    <div><span className="admin-kicker">System globalny</span><h2>Powiadomienia</h2><p>Te ustawienia obowiązują na wszystkich widokach WallDeck. Alarm trafia na początek kolejki i zawsze można zamknąć go ręcznie.</p></div>
    <div className="notification-admin__types">
      <article><span className="notification-admin__badge">ZWYKŁE</span><h3>Krótki komunikat</h3>
        <label>Czas wyświetlania <span><input type="number" min="2" max="60" value={settings.notifications.normal.durationSeconds} onChange={e => update({ ...settings.notifications, normal: { ...settings.notifications.normal, durationSeconds: Number(e.target.value) } })} /> sekund</span></label>
        <label>Dźwięk<select value={settings.notifications.normal.sound} onChange={e => update({ ...settings.notifications, normal: { ...settings.notifications.normal, sound: e.target.value as WallDeckSettings["notifications"]["normal"]["sound"] } })}>{normalSounds.map(sound => <option value={sound.value} key={sound.value}>{sound.label}</option>)}</select></label>
        <button className="button-secondary" type="button" onClick={() => preview("normal")}>Pokaż próbkę</button>
      </article>
      <article className="is-alarm"><span className="notification-admin__badge">ALARMOWE</span><h3>Ważne zdarzenie</h3>
        <label className="notification-admin__check"><input type="checkbox" checked={settings.notifications.alarm.persistent} onChange={e => update({ ...settings.notifications, alarm: { ...settings.notifications.alarm, persistent: e.target.checked } })} /><span>Nie znikaj automatycznie</span></label>
        <label>Czas, gdy autozamykanie jest włączone <span><input type="number" min="5" max="600" disabled={settings.notifications.alarm.persistent} value={settings.notifications.alarm.durationSeconds} onChange={e => update({ ...settings.notifications, alarm: { ...settings.notifications.alarm, durationSeconds: Number(e.target.value) } })} /> sekund</span></label>
        <label>Dźwięk<select value={settings.notifications.alarm.sound} onChange={e => update({ ...settings.notifications, alarm: { ...settings.notifications.alarm, sound: e.target.value as WallDeckSettings["notifications"]["alarm"]["sound"] } })}>{alarmSounds.map(sound => <option value={sound.value} key={sound.value}>{sound.label}</option>)}</select></label>
        <button className="button-secondary" type="button" onClick={() => preview("alarm")}>Pokaż próbkę alarmu</button>
      </article>
    </div>
    <label className="brightness-control"><span><strong>Głośność sygnałów</strong><output>{Math.round(settings.notifications.volume * 100)}%</output></span><input type="range" min="5" max="100" value={Math.round(settings.notifications.volume * 100)} onChange={e => update({ ...settings.notifications, volume: Number(e.target.value) / 100 })} /><small>Dotyczy tylko dźwięków powiadomień WallDeck, nie muzyki ani systemowej głośności tabletu.</small></label>
    <article className="notification-admin__future"><div><span className="admin-kicker">Przyszły moduł</span><h3>Tekst na mowę (TTS)</h3><p>Kontrakt powiadomienia ma już miejsce na tekst do odczytania. Włącznik pojawi się po wdrożeniu silnika TTS, reguł ciszy nocnej i obsługi audio focus.</p></div><span>TODO</span></article>
    <footer><span>{status}</span><button type="submit">Zapisz ustawienia</button></footer>
  </form>;
}
