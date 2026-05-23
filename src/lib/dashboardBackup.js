const BACKUP_APP_ID = "combined-calendar-dashboard";
export const BACKUP_FORMAT_VERSION = 1;

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDashboardBackup({ sources, feeds, events }) {
  const payload = JSON.stringify({ sources, feeds, events });
  const envelope = {
    v: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    exportedAt: new Date().toISOString(),
    data: utf8ToBase64(payload),
  };
  return JSON.stringify(envelope, null, 2);
}

export function decodeDashboardBackup(fileText) {
  const trimmed = fileText.trim();
  if (!trimmed) {
    throw new Error("The file is empty.");
  }

  let base64Payload = trimmed;

  try {
    const envelope = JSON.parse(trimmed);
    if (envelope && typeof envelope === "object") {
      if (envelope.app && envelope.app !== BACKUP_APP_ID) {
        throw new Error("This file is not a Combined Calendar Dashboard backup.");
      }
      if (envelope.v != null && envelope.v > BACKUP_FORMAT_VERSION) {
        throw new Error("This backup was created with a newer app version. Please update the dashboard first.");
      }
      base64Payload = envelope.data ?? envelope.payload;
      if (!base64Payload || typeof base64Payload !== "string") {
        throw new Error("Invalid backup: missing encoded data.");
      }
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      base64Payload = trimmed;
    } else {
      throw err;
    }
  }

  let payload;
  try {
    payload = JSON.parse(base64ToUtf8(base64Payload.replace(/\s/g, "")));
  } catch {
    throw new Error("Could not decode backup. The file may be corrupted or not from this app.");
  }

  if (!Array.isArray(payload.feeds) || !Array.isArray(payload.events)) {
    throw new Error("Invalid backup: missing calendar feeds or events.");
  }

  return {
    sources: Array.isArray(payload.sources) ? payload.sources : null,
    feeds: payload.feeds,
    events: payload.events,
  };
}

export function backupFilename() {
  const date = new Date().toISOString().slice(0, 10);
  return `calendar-dashboard-backup-${date}.json`;
}
