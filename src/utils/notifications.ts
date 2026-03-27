import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export async function initNotifications(): Promise<boolean> {
  let permissionGranted = await isPermissionGranted();

  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === 'granted';
  }

  return permissionGranted;
}

export async function showNotification(title: string, body: string): Promise<void> {
  const permissionGranted = await isPermissionGranted();

  if (permissionGranted) {
    sendNotification({
      title,
      body,
    });
  }
}

// Parse reminder from agent response
// Looks for patterns like "I'll remind you..." or "Reminder set for..."
export function parseReminderFromResponse(content: string): { time: Date; message: string } | null {
  // Look for common reminder patterns
  const patterns = [
    /remind you (?:at |in |on )?(.+?) (?:to |about |that )(.+)/i,
    /reminder set for (.+?)[:\s]+(.+)/i,
    /I'll notify you (?:at |in )?(.+?) (?:to |about |that )(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const timeStr = match[1];
      const message = match[2];
      const time = parseTimeString(timeStr);
      if (time) {
        return { time, message };
      }
    }
  }

  return null;
}

// Parse various time formats
function parseTimeString(timeStr: string): Date | null {
  const now = new Date();
  const lowerStr = timeStr.toLowerCase().trim();

  // Handle relative times like "in 5 minutes", "in 1 hour"
  const relativeMatch = lowerStr.match(/in\s+(\d+)\s+(minute|hour|second|min|hr|sec)s?/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const date = new Date(now);

    if (unit.startsWith('min')) {
      date.setMinutes(date.getMinutes() + amount);
    } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
      date.setHours(date.getHours() + amount);
    } else if (unit.startsWith('sec')) {
      date.setSeconds(date.getSeconds() + amount);
    }

    return date;
  }

  // Handle absolute times like "3pm", "15:00", "3:30 PM"
  const timeMatch = lowerStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const date = new Date(now);
    date.setHours(hours, minutes, 0, 0);

    // If the time is in the past, assume tomorrow
    if (date <= now) {
      date.setDate(date.getDate() + 1);
    }

    return date;
  }

  return null;
}

// Store and manage scheduled reminders
interface ScheduledReminder {
  id: string;
  time: Date;
  message: string;
  timeoutId: number;
}

const scheduledReminders: Map<string, ScheduledReminder> = new Map();

export function scheduleReminder(message: string, time: Date): string {
  const id = `reminder-${Date.now()}`;
  const delay = time.getTime() - Date.now();

  if (delay <= 0) {
    // Time already passed, show immediately
    showNotification('Reminder', message);
    return id;
  }

  const timeoutId = window.setTimeout(() => {
    showNotification('Reminder', message);
    scheduledReminders.delete(id);
  }, delay);

  scheduledReminders.set(id, {
    id,
    time,
    message,
    timeoutId,
  });

  return id;
}

export function cancelReminder(id: string): boolean {
  const reminder = scheduledReminders.get(id);
  if (reminder) {
    clearTimeout(reminder.timeoutId);
    scheduledReminders.delete(id);
    return true;
  }
  return false;
}

export function getScheduledReminders(): ScheduledReminder[] {
  return Array.from(scheduledReminders.values());
}
