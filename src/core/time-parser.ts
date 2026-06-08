export function parseTimeString(str: string, referenceDate: Date = new Date()): Date | undefined {
  // 1. retry_after (秒数)
  // "retry_after": 3600, retry_after: 3600, retry after 3600 seconds など
  const retryAfterRegex = /(?:retry_after|retry after)["'\s]*:?\s*(\d+)/i;
  const retryAfterMatch = str.match(retryAfterRegex);
  if (retryAfterMatch) {
    const seconds = parseInt(retryAfterMatch[1], 10);
    if (!isNaN(seconds)) {
      return new Date(referenceDate.getTime() + seconds * 1000);
    }
  }

  // 1.5 "Resets in XhYmZs" 形式 (Antigravity)
  // 例: "Resets in 157h20m8s", "Resets in 22m49s", "Resets in 0s",
  //     "Your quota will reset after 1s"
  const resetsInRegex = /(?:resets?\s+(?:in|after))\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i;
  const resetsInMatch = str.match(resetsInRegex);
  if (resetsInMatch) {
    const hours = resetsInMatch[1] ? parseInt(resetsInMatch[1], 10) : 0;
    const minutes = resetsInMatch[2] ? parseInt(resetsInMatch[2], 10) : 0;
    const seconds = resetsInMatch[3] ? parseInt(resetsInMatch[3], 10) : 0;
    const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    if (totalMs > 0) {
      return new Date(referenceDate.getTime() + totalMs);
    }
    // totalMs === 0 の場合 (Resets in 0s) はすぐにリトライ可能
    // → 1分後に設定
    return new Date(referenceDate.getTime() + 60_000);
  }

  // 1.8. "Jun 12th, 2026 12:26 PM" 形式 (Codex)
  // 例: "Jun 12th, 2026 12:26 PM", "June 12, 2026 12:26 PM"
  const monthDayYearRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i;
  const mdyMatch = str.match(monthDayYearRegex);
  if (mdyMatch) {
    const monthStr = mdyMatch[1].toLowerCase().slice(0, 3);
    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = monthMap[monthStr];
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    let hour = parseInt(mdyMatch[4], 10);
    const minute = parseInt(mdyMatch[5], 10);
    const second = mdyMatch[6] ? parseInt(mdyMatch[6], 10) : 0;
    const ampm = mdyMatch[7] ? mdyMatch[7].toLowerCase() : "";

    if (ampm === "pm" && hour < 12) {
      hour += 12;
    } else if (ampm === "am" && hour === 12) {
      hour = 0;
    }

    const date = new Date(year, month, day, hour, minute, second);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // 2. ISO8601
  // 2026-06-06T15:00:00+09:00, 2026-06-06T15:00:00Z など
  const isoRegex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/i;
  const isoMatch = str.match(isoRegex);
  if (isoMatch) {
    const parsed = Date.parse(isoMatch[1]);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  // 3. YYYY-MM-DD HH:mm(:ss)?
  // 2026-06-06 15:00
  const dateStrRegex = /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const dateStrMatch = str.match(dateStrRegex);
  if (dateStrMatch) {
    const year = parseInt(dateStrMatch[1], 10);
    const month = parseInt(dateStrMatch[2], 10) - 1; // 0-indexed
    const day = parseInt(dateStrMatch[3], 10);
    const hour = parseInt(dateStrMatch[4], 10);
    const minute = parseInt(dateStrMatch[5], 10);
    const second = dateStrMatch[6] ? parseInt(dateStrMatch[6], 10) : 0;
    const date = new Date(year, month, day, hour, minute, second);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // 4. 時刻のみの表現 (3pm, 3 PM, 15:00, 6:34 AM, resets at 3pm, try again at 6:34 AM など)
  // まず、リセット指示のキーワードに続く時刻表記を探す
  const keywordTimeRegex = /(?:reset|resets|resets_at|try again|try\s+again\s+at|at|resets\s+at|will\s+reset\s+at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const keywordTimeMatch = str.match(keywordTimeRegex);

  let hourStr = "";
  let minStr = "";
  let ampmStr = "";

  if (keywordTimeMatch) {
    hourStr = keywordTimeMatch[1];
    minStr = keywordTimeMatch[2] || "0";
    ampmStr = keywordTimeMatch[3] || "";
  } else {
    // 単体での時刻表現に完全一致するか試す
    const exactTimeRegex = /^\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i;
    const exactMatch = str.match(exactTimeRegex);
    if (exactMatch) {
      hourStr = exactMatch[1];
      minStr = exactMatch[2] || "0";
      ampmStr = exactMatch[3] || "";
    } else {
      // 部分一致で時刻表現を探す (例: 15:00 や 3pm, 6:34 AM)
      // "5-hour" や "3600" などの数値単体を誤検知しないよう、コロン(:)を含むか am/pm を伴うものに限定
      const partialTimeRegex = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/i;
      const partialMatch = str.match(partialTimeRegex);
      if (partialMatch) {
        if (partialMatch[1] !== undefined) {
          hourStr = partialMatch[1];
          minStr = partialMatch[2];
          ampmStr = partialMatch[3] || "";
        } else {
          hourStr = partialMatch[4];
          minStr = "0";
          ampmStr = partialMatch[5];
        }
      }
    }
  }

  if (hourStr) {
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minStr, 10);
    const ampm = ampmStr.toLowerCase();

    if (ampm === "pm" && hour < 12) {
      hour += 12;
    } else if (ampm === "am" && hour === 12) {
      hour = 0;
    }

    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      const date = new Date(referenceDate);
      date.setHours(hour, minute, 0, 0);

      // 設定された時刻が referenceDate (現在時刻) よりも過去であれば翌日とする
      if (date.getTime() <= referenceDate.getTime()) {
        date.setDate(date.getDate() + 1);
      }
      return date;
    }
  }

  return undefined;
}
