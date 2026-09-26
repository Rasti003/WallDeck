import type { Dispatch, FormEvent, SetStateAction } from "react";
import { assistantStates, type WallDeckSettings } from "@walldeck/contracts";
import { stateLabels } from "./assistant-state";
import { assistantBrightness } from "./brightness";

export function AssistantAdmin({ settings, setSettings, save, status }: {
  settings: WallDeckSettings;
  setSettings: Dispatch<SetStateAction<WallDeckSettings>>;
  save: (event: FormEvent) => Promise<void>;
  status: string;
}) {
  const global = settings.viewBrightness["assistant-expressive"];
  const enabled = settings.assistantBrightness.globalEnabled;
  return <form className="admin-form assistant-admin" onSubmit={save}>
    <section className="admin-card">
      <span className="admin-kicker">Asystent</span><h2>Światło i mimika</h2>
      <p className="form-intro">Każda mina może mieć własną jasność ekranu tabletu. Zapisane zmiany są stosowane od razu, również podczas wyświetlania asystenta.</p>
      <label className="switch-row"><input type="checkbox" checked={enabled} onChange={e => setSettings(current => ({ ...current, assistantBrightness: { ...current.assistantBrightness, globalEnabled: e.target.checked } }))} /><span><strong>Wspólna jasność asystenta</strong><small>Po wyłączeniu miny bez własnego ustawienia używają jasności Androida.</small></span></label>
      <label className="brightness-control"><span><strong>Poziom wspólny</strong><output>{enabled ? `${Math.round(global * 100)}%` : "Android"}</output></span><input aria-label="Wspólna jasność asystenta" type="range" min="5" max="100" disabled={!enabled} value={Math.round(global * 100)} onChange={e => setSettings(current => ({ ...current, viewBrightness: { ...current.viewBrightness, "assistant-expressive": Number(e.target.value) / 100 } }))} /></label>
      <p className="form-intro">Własna jasność miny ma pierwszeństwo. „Sen” domyślnie używa 5%. Zakres 5–100% pozwala zachować widoczność sterowania.</p>
      <a href="/assistant-expressive" target="_blank" rel="noreferrer">Otwórz studio mimiki ↗</a>
    </section>
    <section className="assistant-brightness-grid" aria-label="Jasność poszczególnych min">
      {assistantStates.map(state => {
        const override = settings.assistantBrightness.overrides[state];
        const custom = override != null;
        const value = custom ? override : global;
        const effective = assistantBrightness(settings, state);
        const change = (brightness: number | null) => setSettings(current => ({ ...current, assistantBrightness: { ...current.assistantBrightness, overrides: { ...current.assistantBrightness.overrides, [state]: brightness } } }));
        return <article className={`admin-card assistant-brightness-card ${custom ? "is-custom" : ""}`} key={state}>
          <header><h3>{stateLabels[state]}</h3><output>{effective === -1 ? "Android" : `${Math.round(effective * 100)}%`}</output></header>
          <label className="switch-row"><input aria-label={`Własna jasność: ${stateLabels[state]}`} type="checkbox" checked={custom} onChange={e => change(e.target.checked ? (state === "sleep" ? .05 : global) : null)} /><span>Własna jasność</span></label>
          <input aria-label={`Jasność: ${stateLabels[state]}`} type="range" min="5" max="100" disabled={!custom} value={Math.round(value * 100)} onChange={e => change(Number(e.target.value) / 100)} />
          <footer><small>{custom ? "Ustawienie tej miny" : enabled ? "Dziedziczy poziom wspólny" : "Steruje Android"}</small><a href={`/assistant-expressive?state=${state}`} target="_blank" rel="noreferrer" aria-label={`Podgląd: ${stateLabels[state]}`}>Podgląd ↗</a></footer>
        </article>;
      })}
    </section>
    <footer className="admin-card assistant-settings-save"><span role="status">{status}</span><button type="submit">Zapisz ustawienia asystenta</button></footer>
  </form>;
}
