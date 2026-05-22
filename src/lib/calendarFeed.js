import ICAL from "ical.js";

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDatetimeLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function decodeGoogleCid(cid) {
  try {
    const normalized = cid.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function isMicrosoftCalendarHost(hostname) {
  return (
    hostname.includes("outlook.") ||
    hostname.includes("office365.com") ||
    hostname === "outlook.com" ||
    hostname.endsWith(".live.com")
  );
}

/**
 * @returns {{
 *   resolvedUrl: string;
 *   fromGoogleCid: boolean;
 *   isSecretIcs: boolean;
 *   fromMicrosoftWeb: boolean;
 * }}
 */
export function resolveFeedUrl(input) {
  let trimmed = input.trim();
  if (!trimmed) {
    return {
      resolvedUrl: "",
      fromGoogleCid: false,
      isSecretIcs: false,
      fromMicrosoftWeb: false,
    };
  }

  if (trimmed.startsWith("webcal://")) {
    trimmed = `https://${trimmed.slice("webcal://".length)}`;
  }

  try {
    const url = new URL(trimmed);

    if (url.hostname.includes("calendar.google.com")) {
      if (trimmed.includes("/ical/")) {
        return {
          resolvedUrl: trimmed,
          fromGoogleCid: false,
          isSecretIcs: trimmed.includes("/private-"),
          fromMicrosoftWeb: false,
        };
      }

      const cid = url.searchParams.get("cid");
      if (cid) {
        const calendarId = decodeGoogleCid(cid);
        if (calendarId) {
          return {
            resolvedUrl: `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`,
            fromGoogleCid: true,
            isSecretIcs: false,
            fromMicrosoftWeb: false,
          };
        }
      }
    }

    if (isMicrosoftCalendarHost(url.hostname)) {
      const isIcs =
        trimmed.includes(".ics") ||
        url.pathname.endsWith("/calendar.ics") ||
        url.searchParams.has("path") && url.searchParams.get("path")?.includes(".ics");

      if (isIcs) {
        return {
          resolvedUrl: trimmed,
          fromGoogleCid: false,
          isSecretIcs: false,
          fromMicrosoftWeb: false,
        };
      }

      const looksLikeOutlookPage =
        trimmed.includes("/owa/calendar/") ||
        trimmed.includes("/calendar/") ||
        trimmed.includes("publish");

      return {
        resolvedUrl: trimmed,
        fromGoogleCid: false,
        isSecretIcs: false,
        fromMicrosoftWeb: looksLikeOutlookPage,
      };
    }
  } catch {
    // not a valid URL
  }

  return {
    resolvedUrl: trimmed,
    fromGoogleCid: false,
    isSecretIcs: false,
    fromMicrosoftWeb: false,
  };
}

const MICROSOFT_ICS_HELP =
  "Outlook: Settings → Calendar → Shared calendars → Publish a calendar → choose calendar → " +
  'copy the "ICS" link (ends with .ics or starts with webcal://). Do not paste the Outlook web page URL.';

export function friendlyFeedError(
  status,
  bodyText,
  { fromGoogleCid, fromMicrosoftWeb, resolvedUrl } = {}
) {
  const text = bodyText || "";
  const isHtml = text.includes("<html") || text.includes("Error 404");
  const is404 = status === 404 || text.includes("Error 404 (Not Found)");
  const isPublicGoogle = resolvedUrl?.includes("/public/basic.ics");
  let isMicrosoft = false;
  try {
    if (resolvedUrl) {
      isMicrosoft = isMicrosoftCalendarHost(new URL(resolvedUrl).hostname);
    }
  } catch {
    isMicrosoft = false;
  }

  if (fromMicrosoftWeb || (isMicrosoft && isHtml)) {
    return MICROSOFT_ICS_HELP;
  }

  if (is404 || (isHtml && text.includes("404"))) {
    if (fromGoogleCid || isPublicGoogle) {
      return (
        "Google returned 404 — this calendar is not public. The ?cid= share link cannot be used alone. " +
        "In Google Calendar: Settings → select your calendar → Integrate calendar → copy " +
        '"Secret address in iCal format" (URL contains /private-…) and paste that here.'
      );
    }
    if (isMicrosoft) {
      return `Microsoft/Outlook returned 404. ${MICROSOFT_ICS_HELP}`;
    }
    return (
      "Calendar feed not found (404). Confirm the iCal URL from your calendar settings " +
      '(Google: "Secret address in iCal format"; Outlook: publish ICS link).'
    );
  }

  if (isHtml) {
    if (isMicrosoft) return MICROSOFT_ICS_HELP;
    return "Server returned a web page instead of a calendar file. Paste the .ics subscription URL from calendar settings, not the browser share link.";
  }

  if (text && !text.includes("BEGIN:VCALENDAR")) {
    if (isMicrosoft) return MICROSOFT_ICS_HELP;
    return "Downloaded file is not a valid calendar (.ics). Use the iCal subscription URL from calendar settings.";
  }

  const short = text.replace(/\s+/g, " ").trim().slice(0, 120);
  return short || `Failed to load calendar (${status || "unknown"})`;
}

export function parseIcsToEvents(icsText, feedId, sourceId) {
  const jcal = ICAL.parse(icsText);
  const root = new ICAL.Component(jcal);
  const vevents = root.getAllSubcomponents("vevent");

  return vevents
    .map((vevent) => {
      const event = new ICAL.Event(vevent);
      const start = event.startDate?.toJSDate();
      if (!start || Number.isNaN(start.getTime())) return null;

      const endDate = event.endDate?.toJSDate();
      const end = endDate && !Number.isNaN(endDate.getTime()) ? endDate : start;
      const uid = event.uid || crypto.randomUUID();

      return {
        id: `${feedId}:${uid}`,
        feedId,
        title: event.summary || "(No title)",
        sourceId,
        start: toDatetimeLocal(start),
        end: toDatetimeLocal(end),
        location: event.location || "",
        notes: typeof event.description === "string" ? event.description : "",
      };
    })
    .filter(Boolean);
}

export async function fetchCalendarIcs(resolvedUrl, meta = {}) {
  const response = await fetch(`/api/ics?url=${encodeURIComponent(resolvedUrl)}`);
  const text = await response.text();

  if (!response.ok || !text.includes("BEGIN:VCALENDAR")) {
    throw new Error(friendlyFeedError(response.status, text, {
      ...meta,
      resolvedUrl,
    }));
  }

  return text;
}
