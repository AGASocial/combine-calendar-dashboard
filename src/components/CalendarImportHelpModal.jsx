import React, { useEffect, useState } from "react";
import { X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const TABS = [
  { id: "gmail", label: "Gmail" },
  { id: "microsoft", label: "Microsoft" },
];

function GmailHelp() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-600">
      <p>
        This dashboard needs an <strong>iCal subscription URL</strong> (ends with{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.ics</code> or starts with{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">webcal://</code>), not a normal
        Google Calendar page link.
      </p>
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          Open{" "}
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 underline-offset-2 hover:underline"
          >
            Google Calendar
          </a>{" "}
          in a browser.
        </li>
        <li>
          Click the gear icon → <strong>Settings</strong> → under &quot;Settings for my
          calendars&quot;, select the calendar you want to import.
        </li>
        <li>
          Scroll to <strong>Integrate calendar</strong> and copy{" "}
          <strong>Secret address in iCal format</strong> (recommended). The URL usually contains{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/ical/</code> and often{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/private-</code>.
        </li>
        <li>
          In <strong>Connect calendar</strong> on this page, paste that URL, set{" "}
          <strong>Source</strong> to <strong>Gmail</strong>, then click <strong>Add &amp; sync calendar</strong>.
        </li>
      </ol>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-900">
        <p className="font-medium">If sync fails with a 404</p>
        <p className="mt-1 text-blue-800">
          A browser share link with <code className="text-xs">?cid=</code> only works when the calendar is
          public. For private calendars, use the secret iCal URL from step 3 — not the share link from
          the calendar&apos;s overflow menu.
        </p>
      </div>
      <p className="text-xs text-slate-500">
        Example shape:{" "}
        <span className="break-all font-mono">
          https://calendar.google.com/calendar/ical/…/basic.ics
        </span>
      </p>
    </div>
  );
}

function MicrosoftHelp() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-600">
      <p>
        Outlook requires a <strong>published ICS feed</strong>. Paste the subscription link Outlook gives
        you — not the Outlook web calendar page URL.
      </p>
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          Open{" "}
          <a
            href="https://outlook.office.com/calendar"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-purple-700 underline-offset-2 hover:underline"
          >
            Outlook Calendar
          </a>{" "}
          (or Outlook on the web for your organization).
        </li>
        <li>
          Go to <strong>Settings</strong> → <strong>Calendar</strong> →{" "}
          <strong>Shared calendars</strong> → <strong>Publish a calendar</strong>.
        </li>
        <li>
          Choose the calendar, set who can view details, then publish and copy the{" "}
          <strong>ICS</strong> link (ends with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.ics</code>{" "}
          or starts with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">webcal://</code>).
        </li>
        <li>
          In <strong>Connect calendar</strong> on this page, paste that ICS URL, set{" "}
          <strong>Source</strong> to <strong>Microsoft</strong>, then click{" "}
          <strong>Add &amp; sync calendar</strong>.
        </li>
      </ol>
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-950">
        <p className="font-medium">Do not paste these</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
          <li>Outlook web URLs like <code className="text-xs">/owa/calendar/…</code></li>
          <li>Browser address bar links from viewing your calendar</li>
          <li>Links that open the calendar in a browser but do not end in <code className="text-xs">.ics</code></li>
        </ul>
      </div>
      <p className="text-xs text-slate-500">
        Example shape:{" "}
        <span className="break-all font-mono">webcal://outlook.office365.com/…/calendar.ics</span>
      </p>
    </div>
  );
}

export function CalendarImportHelpModal({ open, onOpenChange }) {
  const [tab, setTab] = useState("gmail");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-help-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-lg rounded-3xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <HelpCircle className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 id="import-help-title" className="text-xl font-semibold text-slate-900">
                How to get your calendar URL
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Copy the iCal feed from your provider, then paste it in Connect calendar.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-2xl"
            type="button"
            aria-label="Close dialog"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-6">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === item.id
                  ? item.id === "gmail"
                    ? "border-blue-600 text-blue-700"
                    : "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-6 pt-4">
          {tab === "gmail" ? <GmailHelp /> : <MicrosoftHelp />}
        </div>

        <div className="border-t border-slate-100 p-6 pt-4">
          <Button className="w-full rounded-2xl" type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CalendarImportHelpBanner({ onOpenHelp }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
          <HelpCircle className="h-4 w-4 text-slate-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">Need your calendar import URL?</p>
          <p className="text-sm text-slate-500">
            Step-by-step instructions for Gmail and Microsoft Outlook ICS feeds.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        className="shrink-0 rounded-2xl"
        type="button"
        onClick={onOpenHelp}
      >
        View instructions
      </Button>
    </div>
  );
}
