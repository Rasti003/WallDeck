import type { NotificationSound } from "@walldeck/contracts";
import { nativeBridge } from "./native";

export function notificationTone(sound: NotificationSound) {
  if (sound === "soft") return [{ frequency: 520, start: 0, duration: .12 }];
  if (sound === "chime") return [{ frequency: 523, start: 0, duration: .14 }, { frequency: 784, start: .13, duration: .22 }];
  if (sound === "alarm") return [{ frequency: 740, start: 0, duration: .2 }, { frequency: 520, start: .24, duration: .2 }, { frequency: 740, start: .48, duration: .28 }];
  return [];
}

function playWebNotificationSound(sound: NotificationSound, volume: number) {
  const tones = notificationTone(sound);
  if (!tones.length) return;
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const output = context.createGain();
    output.gain.value = Math.max(.01, Math.min(1, volume)) * .18;
    output.connect(context.destination);
    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = sound === "alarm" ? "square" : "sine";
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0, context.currentTime + tone.start);
      gain.gain.linearRampToValueAtTime(1, context.currentTime + tone.start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + tone.start + tone.duration);
      oscillator.connect(gain).connect(output);
      oscillator.start(context.currentTime + tone.start);
      oscillator.stop(context.currentTime + tone.start + tone.duration);
    }
    const end = Math.max(...tones.map(tone => tone.start + tone.duration));
    window.setTimeout(() => void context.close(), (end + .15) * 1000);
  } catch { /* A browser may block sound until the first user interaction. */ }
}

export function playNotificationSound(sound: NotificationSound, volume: number) {
  if (sound === "none") return;
  if (nativeBridge.available) {
    void nativeBridge.call("notification.playSound", { sound, volume })
      .catch(() => playWebNotificationSound(sound, volume));
    return;
  }
  playWebNotificationSound(sound, volume);
}
