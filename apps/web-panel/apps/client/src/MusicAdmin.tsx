import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { SpotifyStatus, WallDeckSettings } from "@walldeck/contracts";
import { api } from "./api";

export function MusicAdmin({ settings, setSettings, save, activate, status }: {
  settings: WallDeckSettings;
  setSettings: Dispatch<SetStateAction<WallDeckSettings>>;
  save(event: FormEvent): Promise<void>;
  activate(): Promise<void>;
  status: string;
}) {
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null);
  const [message, setMessage] = useState("");
  const refresh = () => api.spotify.status().then(setSpotify).catch(error => setMessage(String(error)));
  useEffect(() => { void refresh(); }, []);

  async function connect() {
    setMessage("Przygotowuję bezpieczne logowanie…");
    try {
      const { url } = await api.spotify.beginAuth();
      window.open(url, "_blank", "noopener,noreferrer");
      setMessage("Dokończ logowanie w otwartej karcie, a następnie odśwież stan.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  async function disconnect() {
    setSpotify(await api.spotify.disconnect());
    setMessage("Konto Spotify zostało odłączone od funkcji wyszukiwania.");
  }

  return <form className="admin-card admin-form music-admin" onSubmit={save}>
    <h2>Spotify na tablecie</h2>
    <p>WallDeck używa aplikacji Spotify do odtwarzania oraz osobnego, ograniczonego połączenia do wyszukiwania, playlist i kolejki.</p>
    <div className="field-grid music-fields"><label>Spotify Client ID
      <input value={settings.music.clientId} maxLength={32} pattern="([a-fA-F0-9]{32})?" placeholder="Client ID z Spotify Developer Dashboard" autoComplete="off" onChange={event => setSettings({ ...settings, music: { clientId: event.target.value.trim() } })} />
    </label></div>
    <p>Client ID jest publiczny. WallDeck używa PKCE, więc Client Secret nie jest potrzebny.</p>
    <dl><dt>Android Redirect URI</dt><dd><code>walldeck://spotify-callback</code></dd><dt>Web API Redirect URI</dt><dd><code>{spotify?.redirectUri ?? "http://127.0.0.1:8888/api/spotify/callback"}</code></dd><dt>Połączenie Web API</dt><dd>{spotify?.connected ? `Połączono${spotify.account ? ` · ${spotify.account}` : ""}` : "Niepołączono"}</dd></dl>
    <div className="button-row">
      <button type="submit">Zapisz ustawienia</button>
      <button type="button" className="button-secondary" onClick={() => void (spotify?.connected ? disconnect() : connect())}>{spotify?.connected ? "Odłącz Web API" : "Połącz wyszukiwanie"}</button>
      <button type="button" className="button-secondary" onClick={() => void refresh()}>Odśwież stan</button>
      <button type="button" className="button-secondary" onClick={() => void activate()}>Pokaż Music na panelu</button>
    </div>
    {(message || spotify?.lastError) && <p role="status">{message || spotify?.lastError}</p>}
    <label className="brightness-control"><span><strong>Jasność widoku Music</strong><output>{Math.round(settings.viewBrightness.music * 100)}%</output></span>
      <input type="range" min="5" max="100" value={Math.round(settings.viewBrightness.music * 100)} onChange={event => setSettings({ ...settings, viewBrightness: { ...settings.viewBrightness, music: Number(event.target.value) / 100 } })} />
    </label>
    <footer><span>{status}</span></footer>
    <h3>Zakres połączenia</h3>
    <p>Odczyt playlist, kolejki i wyszukiwanie. Odtwarzanie oraz dodawanie do kolejki wykonuje zalogowana aplikacja Spotify na tablecie.</p>
  </form>;
}
