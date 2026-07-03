const pad = (value, length = 2) => String(value).padStart(length, "0");

export function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return "00:00:00.000";
    }
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

export function parseTimecode(value) {
    const cleaned = String(value || "").trim().replace(",", ".");
    if (!cleaned) {
        return null;
    }
    const parts = cleaned.split(":");
    if (parts.length > 3 || parts.some((part) => part.trim() === "")) {
        return null;
    }
    let seconds = 0;
    let multiplier = 1;
    for (let i = parts.length - 1; i >= 0; i -= 1) {
        const number = Number(parts[i]);
        if (!Number.isFinite(number) || number < 0) {
            return null;
        }
        seconds += number * multiplier;
        multiplier *= 60;
    }
    return seconds;
}
