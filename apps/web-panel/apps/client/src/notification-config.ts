import type { AppNotification, WallDeckSettings } from "@walldeck/contracts";

export function resolveNotificationPresentation(notification: AppNotification, settings: WallDeckSettings["notifications"]) {
  const alarm = notification.priority === "alarm";
  return {
    alarm,
    persistent: notification.persistent ?? (alarm && settings.alarm.persistent),
    durationMs: notification.durationMs ?? (alarm ? settings.alarm.durationSeconds : settings.normal.durationSeconds) * 1000,
    sound: notification.sound ?? (alarm ? settings.alarm.sound : settings.normal.sound),
    volume: notification.volume ?? settings.volume,
  };
}
