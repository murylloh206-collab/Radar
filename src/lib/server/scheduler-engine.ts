import "server-only";

import type { Offer, SchedulerSettings, SchedulerStats } from "../types";

/**
 * MOTOR DO AGENDADOR INTELIGENTE (SMART SCHEDULER)
 * -----------------------------------------------
 * Fuso horário: America/Sao_Paulo
 * Janela padrão: 07:00 às 00:00 (17 horas operacionais)
 * Meta diária: 50 a 70 ofertas
 * Distribuição temporal anti-burst com jitter humano
 */

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  state: "ativo",
  startHour: "07:00",
  endHour: "00:00",
  dailyTarget: 60,
  maxPerHour: 5,
  timezone: "America/Sao_Paulo",
  channelDestination: "Grupo VIP de Ofertas",
  consecutiveFailures: 0,
  maxConsecutiveFailures: 3,
  lastDispatchedAt: null,
  lastDispatchedOfferTitle: null,
  lastError: null,
};

export interface SaoPauloTimeInfo {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  hour: number;
  minute: number;
  timestamp: number;
}

/**
 * Retorna as partes de data e hora atuais no fuso de São Paulo.
 */
export function getSaoPauloTime(date = new Date()): SaoPauloTimeInfo {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const day = getPart("day");
  const month = getPart("month");
  const year = getPart("year");
  const hour = parseInt(getPart("hour"), 10) || 0;
  const minute = parseInt(getPart("minute"), 10) || 0;

  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return {
    dateStr,
    timeStr,
    hour,
    minute,
    timestamp: date.getTime(),
  };
}

/**
 * Converte componentes de data e hora no fuso de São Paulo para um objeto Date UTC.
 */
export function createDateInSaoPaulo(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, min] = timeStr.split(":").map(Number);

  // Cria a string ISO representando o horário de São Paulo (UTC-3)
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:00-03:00`;
  return new Date(isoStr);
}

/**
 * Verifica se o horário atual de São Paulo está dentro da janela de operação permitida.
 */
export function isWithinOperatingWindow(settings: SchedulerSettings, spTime: SaoPauloTimeInfo): boolean {
  const [startH, startM] = settings.startHour.split(":").map(Number);
  const currentMinutes = spTime.hour * 60 + spTime.minute;
  const startMinutes = startH * 60 + (startM || 0);

  // Se o final for 00:00 (meia-noite), a janela vai das startHour até 23:59
  if (settings.endHour === "00:00" || settings.endHour === "24:00") {
    return currentMinutes >= startMinutes && currentMinutes < 24 * 60;
  }

  const [endH, endM] = settings.endHour.split(":").map(Number);
  const endMinutes = endH * 60 + (endM || 0);

  if (endMinutes > startMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Janela que vira o dia
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Calcula o próximo slot vago de publicação distribuído ao longo da janela.
 */
export function calculateNextScheduledSlot(
  existingOffers: Offer[],
  settings: SchedulerSettings,
  now = new Date()
): { scheduledFor: string; windowDate: string } {
  const spNow = getSaoPauloTime(now);

  // 1. Duração total da janela diária em minutos (padrão: 07:00 às 00:00 = 17h = 1020 min)
  const [startH, startM] = settings.startHour.split(":").map(Number);
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = settings.endHour === "00:00" ? 24 * 60 : parseInt(settings.endHour, 10) * 60;
  const totalWindowMinutes = Math.max(60, endMinutes - startMinutes);

  // 2. Intervalo base por oferta (ex.: 1020 min / 60 ofertas = 17 min)
  const target = Math.max(10, Math.min(150, settings.dailyTarget || 60));
  const baseIntervalMinutes = Math.max(8, Math.round(totalWindowMinutes / target));

  // 3. Jitter aleatório (±2 minutos) para comportamento natural anti-rajada
  const randomJitter = Math.floor(Math.random() * 5) - 2; // -2, -1, 0, 1, 2
  const stepMinutes = Math.max(5, baseIntervalMinutes + randomJitter);

  // 4. Analisa ofertas agendadas para hoje
  const todayScheduled = existingOffers
    .filter(
      (o) =>
        o.scheduledWindowDate === spNow.dateStr &&
        o.scheduledFor &&
        o.whatsappStatus !== "falhou"
    )
    .sort((a, b) => (a.scheduledFor || "").localeCompare(b.scheduledFor || ""));

  const isTodayFull = todayScheduled.length >= target;
  const insideWindow = isWithinOperatingWindow(settings, spNow);

  // Se já atingiu a meta de hoje OU já passou da meia-noite (00:00):
  // Agenda para a abertura da próxima janela (dia seguinte às 07:00)
  if (isTodayFull || (!insideWindow && spNow.hour >= 0 && spNow.hour < startH)) {
    // Madrugada antes das 07:00: agenda para hoje mesmo às 07:00
    const slotTime = createDateInSaoPaulo(spNow.dateStr, settings.startHour);
    const existingAtStart = todayScheduled.filter((o) => new Date(o.scheduledFor || 0) <= slotTime).length;
    const finalDate = new Date(slotTime.getTime() + existingAtStart * stepMinutes * 60 * 1000);
    return {
      scheduledFor: finalDate.toISOString(),
      windowDate: spNow.dateStr,
    };
  }

  if (isTodayFull || (!insideWindow && spNow.hour >= 23)) {
    // Dia seguinte às startHour
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const spNextDay = getSaoPauloTime(nextDay);
    const tomorrowBase = createDateInSaoPaulo(spNextDay.dateStr, settings.startHour);

    const tomorrowScheduled = existingOffers.filter(
      (o) => o.scheduledWindowDate === spNextDay.dateStr && o.scheduledFor
    );

    const finalDate = new Date(tomorrowBase.getTime() + tomorrowScheduled.length * stepMinutes * 60 * 1000);
    return {
      scheduledFor: finalDate.toISOString(),
      windowDate: spNextDay.dateStr,
    };
  }

  // 5. Agendamento para hoje dentro da janela
  let nextDate: Date;
  if (todayScheduled.length === 0) {
    // Primeira oferta do dia: agora + 3 minutos
    nextDate = new Date(now.getTime() + 3 * 60 * 1000);
  } else {
    const lastOfferTime = new Date(todayScheduled[todayScheduled.length - 1].scheduledFor || now);
    const minNext = new Date(now.getTime() + 3 * 60 * 1000);
    const candidate = new Date(lastOfferTime.getTime() + stepMinutes * 60 * 1000);
    nextDate = candidate > minNext ? candidate : minNext;
  }

  // Verifica se o slot calculado ultrapassa as 00:00 de hoje
  const spSlot = getSaoPauloTime(nextDate);
  if (spSlot.dateStr !== spNow.dateStr || spSlot.hour < startH) {
    // Ultrapassou a janela de hoje: move para amanhã às startHour
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const spTomorrow = getSaoPauloTime(tomorrow);
    const tomorrowStart = createDateInSaoPaulo(spTomorrow.dateStr, settings.startHour);
    return {
      scheduledFor: tomorrowStart.toISOString(),
      windowDate: spTomorrow.dateStr,
    };
  }

  return {
    scheduledFor: nextDate.toISOString(),
    windowDate: spNow.dateStr,
  };
}

/**
 * Computa as estatísticas consolidadas do agendador em tempo real.
 */
export function computeSchedulerStats(
  offers: Offer[],
  settings: SchedulerSettings,
  now = new Date()
): SchedulerStats {
  const spNow = getSaoPauloTime(now);

  let aprovadasFila = 0;
  let agendadasHoje = 0;
  let enviadasHoje = 0;
  let pendentesProximaJanela = 0;
  let comFalha = 0;
  let proximoEnvio: string | null = null;
  let nextTimeMs = Infinity;

  const todayStart = createDateInSaoPaulo(spNow.dateStr, "00:00").getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  for (const offer of offers) {
    if (offer.whatsappStatus === "falhou") {
      comFalha++;
    }

    if (offer.status === "aprovado") {
      aprovadasFila++;

      if (offer.whatsappStatus === "agendado" && offer.scheduledFor) {
        const schedMs = new Date(offer.scheduledFor).getTime();

        if (offer.scheduledWindowDate === spNow.dateStr) {
          agendadasHoje++;
        } else if (schedMs > todayEnd) {
          pendentesProximaJanela++;
        }

        if (schedMs >= now.getTime() && schedMs < nextTimeMs) {
          nextTimeMs = schedMs;
          proximoEnvio = offer.scheduledFor;
        }
      }
    }

    if (offer.whatsappStatus === "enviado" && offer.whatsappSentAt) {
      const sentMs = new Date(offer.whatsappSentAt).getTime();
      if (sentMs >= todayStart && sentMs < todayEnd) {
        enviadasHoje++;
      }
    }
  }

  return {
    aprovadasFila,
    agendadasHoje,
    enviadasHoje,
    pendentesProximaJanela,
    comFalha,
    proximoEnvio,
    metaDiaria: settings.dailyTarget,
    limiteHora: settings.maxPerHour,
  };
}
