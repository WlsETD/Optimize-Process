/* 工廠在台灣：所有「今天」「現在幾點」一律以 Asia/Taipei 計（UTC+8，無夏令時間） */
export function taipei(now: Date): { date: string; hour: number; label: string } {
  const t = new Date(now.getTime() + 8 * 3600_000);
  const date = t.toISOString().slice(0, 10);
  const hour = t.getUTCHours() + t.getUTCMinutes() / 60;
  return { date, hour, label: `${date} ${t.toISOString().slice(11, 16)}` };
}
