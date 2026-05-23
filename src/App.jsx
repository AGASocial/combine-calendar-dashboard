import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Plus,
  Trash2,
  Clock,
  MapPin,
  Link2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarImportHelpBanner,
  CalendarImportHelpModal,
} from "@/components/CalendarImportHelpModal";
import {
  fetchCalendarIcs,
  parseIcsToEvents,
  resolveFeedUrl,
} from "@/lib/calendarFeed";
import {
  backupFilename,
  decodeDashboardBackup,
  encodeDashboardBackup,
} from "@/lib/dashboardBackup";

const STORAGE_KEY = "combined-calendar-dashboard-v2";

const defaultSources = [
  { id: "gmail", name: "Gmail", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "microsoft", name: "Microsoft", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { id: "other", name: "Other", color: "bg-stone-100 text-stone-700 border-stone-200" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);

    const legacy = localStorage.getItem("combined-calendar-dashboard-v1");
    if (legacy) return JSON.parse(legacy);
  } catch {
    return null;
  }
  return null;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function overlapsSelectedDay(event, selectedDate) {
  const start = new Date(event.start);
  const end = new Date(event.end || event.start);
  const dayStart = new Date(`${selectedDate}T00:00:00`);
  const dayEnd = new Date(`${selectedDate}T23:59:59`);
  return start <= dayEnd && end >= dayStart;
}

function isBusyEvent(event) {
  return (event.title || "").trim().toLowerCase() === "busy";
}

function calendarLabelForEvent(event, feedById, sourceById) {
  if (event.feedId && feedById[event.feedId]) {
    return feedById[event.feedId].name;
  }
  const source = sourceById[event.sourceId] || sourceById.other;
  return source?.name ?? "Calendar";
}

function notesLikelyTruncated(notes) {
  const lineCount = notes.split(/\r?\n/).length;
  return notes.length > 200 || lineCount > 3;
}

function EventNotes({ notes }) {
  const [expanded, setExpanded] = useState(false);
  if (!notes?.trim()) return null;

  const canExpand = notesLikelyTruncated(notes);

  return (
    <div className="mt-3">
      <p
        className={`text-sm leading-6 text-slate-600 whitespace-pre-wrap break-words ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {notes}
      </p>
      {canExpand && (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export default function CombinedCalendarDashboard() {
  const initial = loadState();
  const [sources, setSources] = useState(initial?.sources || defaultSources);
  const [feeds, setFeeds] = useState(initial?.feeds || []);
  const [events, setEvents] = useState(initial?.events || []);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [form, setForm] = useState({
    title: "",
    sourceId: "gmail",
    start: `${todayISO()}T09:00`,
    end: `${todayISO()}T10:00`,
    location: "",
    notes: "",
  });
  const [feedForm, setFeedForm] = useState({
    name: "",
    sourceId: "gmail",
    url: "",
  });
  const [feedMessage, setFeedMessage] = useState("");
  const [syncingFeedId, setSyncingFeedId] = useState(null);
  const [importHelpOpen, setImportHelpOpen] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sources, feeds, events })
    );
  }, [sources, feeds, events]);

  const sourceById = useMemo(() => {
    return Object.fromEntries(sources.map((source) => [source.id, source]));
  }, [sources]);

  const feedById = useMemo(() => {
    return Object.fromEntries(feeds.map((feed) => [feed.id, feed]));
  }, [feeds]);

  const manualEvents = useMemo(
    () => events.filter((event) => !event.feedId),
    [events]
  );

  const syncFeed = useCallback(async (feed) => {
    setSyncingFeedId(feed.id);
    setFeedMessage("");

    try {
      const icsText = await fetchCalendarIcs(feed.resolvedUrl, {
        fromGoogleCid: feed.fromGoogleCid,
        fromMicrosoftWeb: feed.fromMicrosoftWeb,
      });
      const imported = parseIcsToEvents(icsText, feed.id, feed.sourceId);

      setEvents((current) => [
        ...current.filter((event) => event.feedId !== feed.id),
        ...imported,
      ]);

      setFeeds((current) =>
        current.map((item) =>
          item.id === feed.id
            ? {
                ...item,
                lastSync: new Date().toISOString(),
                lastError: null,
                eventCount: imported.length,
              }
            : item
        )
      );

      setFeedMessage(`Synced “${feed.name}”: ${imported.length} events.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setFeeds((current) =>
        current.map((item) =>
          item.id === feed.id ? { ...item, lastError: message } : item
        )
      );
      setFeedMessage(message);
    } finally {
      setSyncingFeedId(null);
    }
  }, []);

  useEffect(() => {
    if (feeds.length === 0) return;
    feeds.forEach((feed) => {
      if (!feed.lastSync) syncFeed(feed);
    });
    // Only auto-sync feeds that have never been synced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventsForDay = useMemo(() => {
    return events
      .filter((event) => !isBusyEvent(event) && overlapsSelectedDay(event, selectedDate))
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [events, selectedDate]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events
      .filter((event) => !isBusyEvent(event) && new Date(event.end || event.start) >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 8);
  }, [events]);

  async function addFeed(e) {
    e.preventDefault();
    const inputUrl = feedForm.url.trim();
    if (!inputUrl) return;

    const { resolvedUrl, fromGoogleCid, isSecretIcs, fromMicrosoftWeb } = resolveFeedUrl(inputUrl);
    if (!resolvedUrl.startsWith("http")) {
      setFeedMessage("Paste a full calendar URL (Google share link or .ics URL).");
      return;
    }

    if (fromGoogleCid) {
      setFeedMessage(
        "Google share link detected — will try the public feed. If sync fails, use the secret iCal URL from Google Calendar settings."
      );
    } else if (fromMicrosoftWeb) {
      setFeedMessage(
        "That looks like an Outlook web page, not an ICS feed. Publish the calendar and paste the ICS link (see help below)."
      );
      return;
    }

    const feed = {
      id: crypto.randomUUID(),
      name: feedForm.name.trim() || "Imported calendar",
      sourceId: feedForm.sourceId,
      inputUrl,
      resolvedUrl,
      fromGoogleCid,
      isSecretIcs,
      fromMicrosoftWeb,
      lastSync: null,
      lastError: null,
      eventCount: 0,
    };

    setFeeds((current) => [...current, feed]);
    setFeedForm({ name: "", sourceId: feedForm.sourceId, url: "" });
    await syncFeed(feed);
  }

  function removeFeed(feedId) {
    setFeeds((current) => current.filter((feed) => feed.id !== feedId));
    setEvents((current) => current.filter((event) => event.feedId !== feedId));
  }

  async function updateFeedUrl(feedId, newInputUrl) {
    const inputUrl = newInputUrl.trim();
    if (!inputUrl) return;

    const { resolvedUrl, fromGoogleCid, isSecretIcs, fromMicrosoftWeb } = resolveFeedUrl(inputUrl);
    if (!resolvedUrl.startsWith("http")) {
      setFeedMessage("Paste a valid iCal URL (should contain /ical/ and often /private-).");
      return;
    }

    const updated = feeds.map((feed) =>
      feed.id === feedId
        ? {
            ...feed,
            inputUrl,
            resolvedUrl,
            fromGoogleCid,
            isSecretIcs,
            fromMicrosoftWeb,
            lastError: null,
          }
        : feed
    );
    const feed = updated.find((f) => f.id === feedId);
    if (feed?.fromMicrosoftWeb) {
      setFeedMessage(
        "That looks like an Outlook web page, not an ICS feed. Paste the published ICS link (ends with .ics)."
      );
      return;
    }
    setFeeds(updated);
    if (feed) await syncFeed(feed);
  }

  function addEvent(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.start || !form.end) return;

    setEvents((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ...form,
        title: form.title.trim(),
      },
    ]);

    setForm({
      title: "",
      sourceId: form.sourceId,
      start: `${selectedDate}T09:00`,
      end: `${selectedDate}T10:00`,
      location: "",
      notes: "",
    });
  }

  function deleteEvent(id) {
    setEvents((current) => current.filter((event) => event.id !== id));
  }

  function clearManualEvents() {
    setEvents((current) => current.filter((event) => event.feedId));
  }

  useEffect(() => {
    const interval = setInterval(() => {
      refreshAllFeeds();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function refreshAllFeeds() {
    for (const feed of feeds) {
      await syncFeed(feed);
    }
  }

  function exportDashboardData() {
    const content = encodeDashboardBackup({ sources, feeds, events });
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFilename();
    link.click();
    URL.revokeObjectURL(url);
    setTransferMessage("Backup downloaded. Import this file in another browser to restore your calendars.");
  }

  async function importDashboardData(file) {
    setTransferMessage("");
    try {
      const text = await file.text();
      const backup = decodeDashboardBackup(text);
      const hasExisting = feeds.length > 0 || events.length > 0;
      if (
        hasExisting &&
        !window.confirm(
          "Import will replace your connected calendars, events, and settings in this browser. Continue?"
        )
      ) {
        return;
      }

      if (backup.sources) setSources(backup.sources);
      setFeeds(backup.feeds);
      setEvents(backup.events);
      setTransferMessage(
        `Imported ${backup.feeds.length} feed(s) and ${backup.events.length} event(s). Calendars will sync on refresh.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setTransferMessage(message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
              <CalendarDays className="h-4 w-4" /> Combined Calendar Dashboard
            </div>
            <h1 className="text-3xl font-bold tracking-tight">All your work calendars in one view</h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Connect Google or Outlook ICS feeds below. Events from every feed appear together in Daily view and Upcoming.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <span key={source.id} className={`rounded-full border px-3 py-1 text-sm font-medium ${source.color}`}>
                {source.name}
              </span>
            ))}
          </div>
        </header>

        <CalendarImportHelpBanner
          onOpenHelp={() => setImportHelpOpen(true)}
          onExportData={exportDashboardData}
          onImportFile={importDashboardData}
          transferMessage={transferMessage}
        />
        <CalendarImportHelpModal open={importHelpOpen} onOpenChange={setImportHelpOpen} />

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardContent className="p-6">
                <h2 className="mb-4 text-xl font-semibold">Upcoming</h2>
                <div className="space-y-3">
                  {upcomingEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">No upcoming events. Connect a calendar above.</p>
                  ) : (
                    upcomingEvents.map((event) => {
                      const source = sourceById[event.sourceId] || sourceById.other;
                      const calendarLabel = calendarLabelForEvent(event, feedById, sourceById);
                      return (
                        <div key={event.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="font-medium">{event.title}</div>
                          <div className="mt-1 text-sm text-slate-500">{formatDateTime(event.start)}</div>
                          <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs ${source.color}`}>
                            {calendarLabel}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardContent className="p-6">
                <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
                  <Link2 className="h-5 w-5" /> Connect calendar
                </h2>
                <p className="mb-4 text-sm text-slate-500">
                  Paste an <strong>ICS subscription URL</strong> (.ics or webcal://). Set <strong>Source</strong> to Microsoft for Outlook feeds.{" "}
                  <button
                    type="button"
                    className="font-medium text-slate-700 underline-offset-2 hover:underline"
                    onClick={() => setImportHelpOpen(true)}
                  >
                    How to get the URL
                  </button>
                </p>
                <form onSubmit={addFeed} className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-600">Label</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                      value={feedForm.name}
                      onChange={(e) => setFeedForm({ ...feedForm, name: e.target.value })}
                      placeholder="Work calendar"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-600">Source</span>
                    <select
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                      value={feedForm.sourceId}
                      onChange={(e) => setFeedForm({ ...feedForm, sourceId: e.target.value })}
                    >
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>{source.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-600">Calendar URL</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                      value={feedForm.url}
                      onChange={(e) => setFeedForm({ ...feedForm, url: e.target.value })}
                      placeholder="https://…/calendar.ics or webcal://…"
                    />
                  </label>

                  <Button className="w-full rounded-2xl" type="submit" disabled={syncingFeedId !== null}>
                    Add & sync calendar
                  </Button>
                </form>

                {feedMessage && (
                  <p className="mt-3 text-sm text-slate-600">{feedMessage}</p>
                )}

                {feeds.length > 0 && (
                  <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">Connected ({feeds.length})</span>
                      <Button
                        variant="ghost"
                        className="h-8 rounded-xl px-2 text-xs"
                        type="button"
                        disabled={syncingFeedId !== null}
                        onClick={refreshAllFeeds}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" /> Refresh all
                      </Button>
                    </div>
                    {feeds.map((feed) => (
                      <div key={feed.id} data-feed-row className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm">
                        <div className="font-medium">{feed.name}</div>
                        <div className="mt-1 text-xs text-slate-500 break-all">{feed.resolvedUrl}</div>
                        {feed.lastSync && (
                          <div className="mt-1 text-xs text-slate-500">
                            {feed.eventCount ?? 0} events · last sync {formatDateTime(feed.lastSync)}
                          </div>
                        )}
                        {feed.lastError && (
                          <div className="mt-2 space-y-2">
                            <div className="text-xs text-red-600">{feed.lastError}</div>
                            <input
                              data-feed-url-input
                              className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-xs outline-none focus:border-red-400"
                              placeholder="Paste secret iCal URL (…/private-…/basic.ics)"
                              defaultValue={feed.isSecretIcs ? feed.inputUrl : ""}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateFeedUrl(feed.id, e.currentTarget.value);
                                }
                              }}
                            />
                            <Button
                              variant="outline"
                              className="h-8 w-full rounded-xl text-xs"
                              type="button"
                              disabled={syncingFeedId === feed.id}
                              onClick={(e) => {
                                const input = e.currentTarget.closest("[data-feed-row]")?.querySelector("[data-feed-url-input]");
                                if (input) updateFeedUrl(feed.id, input.value);
                              }}
                            >
                              Update URL & sync
                            </Button>
                          </div>
                        )}
                        <div className="mt-2 flex gap-2">
                          <Button
                            variant="outline"
                            className="h-8 flex-1 rounded-xl text-xs"
                            type="button"
                            disabled={syncingFeedId === feed.id}
                            onClick={() => syncFeed(feed)}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" /> Sync
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-8 rounded-xl text-xs text-red-600"
                            type="button"
                            onClick={() => removeFeed(feed.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardContent className="p-6">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                  <Plus className="h-5 w-5" /> Add manual event
                </h2>
                <form onSubmit={addEvent} className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-600">Title</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Meeting title"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-600">Calendar source</span>
                    <select
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                      value={form.sourceId}
                      onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
                    >
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>{source.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-600">Start</span>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                        value={form.start}
                        onChange={(e) => setForm({ ...form, start: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-600">End</span>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                        value={form.end}
                        onChange={(e) => setForm({ ...form, end: e.target.value })}
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-600">Location / link</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="Teams, Google Meet, office, etc."
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-600">Notes</span>
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Optional"
                    />
                  </label>

                  <Button className="w-full rounded-2xl" type="submit">Save event</Button>
                </form>
              </CardContent>
            </Card>

            
          </div>

          <main className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Daily view</h2>
                    <p className="text-sm text-slate-500">
                      {events.length} total · {manualEvents.length} manual · {feeds.length} feed{feeds.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-400"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                    <Button variant="outline" className="rounded-2xl" onClick={clearManualEvents} type="button">
                      Clear manual
                    </Button>
                    <Button
                        variant="ghost"
                        className="h-8 rounded-xl px-2 text-xs"
                        type="button"
                        disabled={syncingFeedId !== null}
                        onClick={refreshAllFeeds}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" /> Refresh all
                      </Button>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {eventsForDay.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                      No events for this date. Add a calendar feed or manual event.
                    </div>
                  ) : (
                    eventsForDay.map((event) => {
                      const source = sourceById[event.sourceId] || sourceById.other;
                      const calendarLabel = calendarLabelForEvent(event, feedById, sourceById);
                      return (
                        <div key={event.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${source.color}`}>
                                  {calendarLabel}
                                </span>
                                <span className="flex items-center gap-1 text-sm text-slate-500">
                                  <Clock className="h-4 w-4" /> {formatTime(event.start)} – {formatTime(event.end)}
                                </span>
                              </div>
                              <h3 className="text-lg font-semibold">{event.title}</h3>
                              {event.location && (
                                <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                                  <MapPin className="h-4 w-4" /> {event.location}
                                </p>
                              )}
                              <EventNotes notes={event.notes} />
                            </div>
                            {!event.feedId && (
                              <Button variant="ghost" size="icon" className="rounded-2xl" onClick={() => deleteEvent(event.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 bg-slate-900 text-white shadow-sm">
              
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
