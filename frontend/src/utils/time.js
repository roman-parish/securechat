import { format, isToday, isYesterday, isThisYear, differenceInMinutes, differenceInDays } from 'date-fns';
import { useEffect, useState } from 'react';

// Re-renders callers every minute so relative times stay accurate
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Full absolute datetime — used in title/tooltip attributes
// e.g. "Wednesday, May 14, 2026 at 9:30 AM"
export function fullDateTime(date) {
  if (!date) return '';
  return format(new Date(date), "EEEE, MMMM d, yyyy 'at' h:mm a");
}

// Smart relative time — used for audit logs, last-seen, etc.
// < 1 min  → "just now"
// < 60 min → "5m ago"
// today    → "Today at 9:30 AM"
// yesterday→ "Yesterday at 9:30 AM"
// < 7 days → "Mon at 9:30 AM"
// this year→ "May 14 at 9:30 AM"
// older    → "May 14, 2025"
export function smartRelative(date, now = new Date()) {
  if (!date) return '';
  const d = new Date(date);
  const mins = differenceInMinutes(now, d);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (isToday(d))     return `Today at ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday at ${format(d, 'h:mm a')}`;
  if (differenceInDays(now, d) < 7) return format(d, "EEE 'at' h:mm a");
  if (isThisYear(d))  return format(d, "MMM d 'at' h:mm a");
  return format(d, 'MMM d, yyyy');
}

// Sidebar conversation list — compact, no time for older entries
// today    → "9:30 AM"
// yesterday→ "Yesterday"
// < 7 days → "Mon"
// this year→ "May 14"
// older    → "MM/dd/yy"
export function convTime(date, now = new Date()) {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d))     return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  if (differenceInDays(now, d) < 7) return format(d, 'EEE');
  if (isThisYear(d))  return format(d, 'MMM d');
  return format(d, 'MM/dd/yy');
}

// Message bubble time — just the clock (date is shown by day separator)
export function msgTime(date) {
  if (!date) return '';
  return format(new Date(date), 'h:mm a');
}
