/* Brasília = UTC-3 (BRT), no daylight saving since 2019 */

export interface BrasiliaTime {
  date:    string;   // "YYYY-MM-DD"
  time:    string;   // "HH:MM"
  hour:    number;
  period:  "madrugada" | "manhã" | "tarde" | "noite";
  dateLabel: string; // "segunda-feira, 12 de maio de 2026"
}

export function getBrasiliaTime(): BrasiliaTime {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000); // UTC-3

  const year  = brt.getUTCFullYear();
  const month = brt.getUTCMonth();
  const day   = brt.getUTCDate();
  const hour  = brt.getUTCHours();
  const min   = brt.getUTCMinutes();

  const pad = (n: number) => String(n).padStart(2, "0");

  const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const weekdays = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const weekday = weekdays[brt.getUTCDay()];

  const period =
    hour >= 6  && hour < 12 ? "manhã"      :
    hour >= 12 && hour < 18 ? "tarde"      :
    hour >= 18              ? "noite"       :
    "madrugada";

  return {
    date:      `${year}-${pad(month + 1)}-${pad(day)}`,
    time:      `${pad(hour)}:${pad(min)}`,
    hour,
    period,
    dateLabel: `${weekday}, ${day} de ${months[month]} de ${year}`,
  };
}
