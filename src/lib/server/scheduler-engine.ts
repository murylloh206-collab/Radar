import "server-only";

import type {
  Offer,
  ScheduleDistribution,
  SchedulerMode,
  SchedulerSettings,
  SchedulerStats,
} from "../types";

/**
 * MOTOR DO AGENDADOR INTELIGENTE (SMART SCHEDULER EVOLUTION)
 * -----------------------------------------------------------
 * Fuso horário: America/Sao_Paulo (UTC-3)
 * Janela padrão: 07:00 às 00:00 (17 horas operacionais)
 * 3 Modos:
 *   1. Meta diária (daily_target)
 *   2. Posts por hora (posts_per_hour)
 *   3. Intervalo entre posts (interval_minutes)
 * 2 Distribuições:
 *   - Fixa: horários uniformes e previsíveis
 *   - Aleatória controlada: jitter suave sem ultrapassar limites
 */

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  state: "ativo",
  startHour: "07:00",
  endHour: "00:00",
  dailyTarget: 51,
  maxPerHour: 5,
  timezone: "America/Sao_Paulo",
  channelDestination: "Radar de Ofertas",
  consecutiveFailures: 0,
  maxConsecutiveFailures: 3,
  lastDispatchedAt: null,
  lastDispatchedOfferTitle: null,
  lastError: null,
  mode: "interval_minutes",
  distribution: "fixed",
  intervalMinutes: 20,
  postsPerHour: 3,
  minScore: 75,
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

  const pad = (n: number) => String(n).padStart(2, "0");
  const isoStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:00-03:00`;
  return new Date(isoStr);
}

/**
 * Calcula a duração total da janela operacional em minutos.
 */
export function calculateWindowMinutes(startHour: string, endHour: string): {
  startMinutes: number;
  endMinutes: number;
  totalWindowMinutes: number;
} {
  const [startH, startM] = (startHour || "07:00").split(":").map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);

  let endMinutes = 24 * 60;
  if (endHour && endHour !== "00:00" && endHour !== "24:00") {
    const [endH, endM] = endHour.split(":").map(Number);
    endMinutes = (endH || 0) * 60 + (endM || 0);
  }

  let totalWindowMinutes = 0;
  if (endMinutes > startMinutes) {
    totalWindowMinutes = endMinutes - startMinutes;
  } else {
    totalWindowMinutes = 24 * 60 - startMinutes + endMinutes;
  }

  totalWindowMinutes = Math.max(60, totalWindowMinutes);

  return {
    startMinutes,
    endMinutes,
    totalWindowMinutes,
  };
}

/**
 * Verifica se o horário atual de São Paulo está dentro da janela de operação permitida.
 */
export function isWithinOperatingWindow(settings: SchedulerSettings, spTime: SaoPauloTimeInfo): boolean {
  const { startMinutes, endMinutes } = calculateWindowMinutes(settings.startHour, settings.endHour);
  const currentMinutes = spTime.hour * 60 + spTime.minute;

  if (settings.endHour === "00:00" || settings.endHour === "24:00" || endMinutes >= 24 * 60) {
    return currentMinutes >= startMinutes && currentMinutes < 24 * 60;
  }

  if (endMinutes > startMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Janela que vira o dia
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Helper direto para checar janela operacional a partir de strings de hora e data UTC.
 */
export function isWithinOperationalWindow(startHour: string, endHour: string, date = new Date()): boolean {
  const spTime = getSaoPauloTime(date);
  return isWithinOperatingWindow({ startHour, endHour } as SchedulerSettings, spTime);
}

/**
 * Calcula as métricas consolidadas do modo ativo: intervalo em minutos e total diário estimado.
 */
export function calculateScheduleMetrics(settings: SchedulerSettings): {
  totalWindowMinutes: number;
  intervalMinutes: number;
  totalPosts: number;
} {
  const { totalWindowMinutes } = calculateWindowMinutes(settings.startHour, settings.endHour);
  const mode: SchedulerMode = settings.mode || "interval_minutes";

  let intervalMinutes = 20;
  let totalPosts = 51;

  if (mode === "daily_target") {
    const target = Math.max(1, Math.min(150, settings.dailyTarget || 30));
    intervalMinutes = Math.max(5, Math.floor(totalWindowMinutes / target));
    totalPosts = target;
  } else if (mode === "posts_per_hour") {
    const pph = Math.max(1, Math.min(30, settings.postsPerHour || 2));
    intervalMinutes = Math.max(2, Math.round(60 / pph));
    totalPosts = Math.max(1, Math.floor(totalWindowMinutes / intervalMinutes));
  } else {
    // interval_minutes
    const interval = Math.max(5, Math.min(360, settings.intervalMinutes || 20));
    intervalMinutes = interval;
    totalPosts = Math.max(1, Math.floor(totalWindowMinutes / interval));
  }

  return {
    totalWindowMinutes,
    intervalMinutes,
    totalPosts,
  };
}

export interface ScheduleSlot {
  timeStr: string; // HH:mm
  dateStr: string; // YYYY-MM-DD
  dateUtc: Date;
  index: number;
}

/**
 * Gera a lista completa de horários programados do dia no fuso de São Paulo.
 * Suporta modo fixo (previsível/uniforme) e aleatório controlado (jitter anti-rajada).
 */
export function generateDayScheduleSlots(
  settings: SchedulerSettings,
  inputDateStr?: string
): ScheduleSlot[] {
  const dateStr = inputDateStr || getSaoPauloTime().dateStr;
  const { startMinutes, endMinutes, totalWindowMinutes } = calculateWindowMinutes(
    settings.startHour,
    settings.endHour
  );
  const { intervalMinutes, totalPosts } = calculateScheduleMetrics(settings);
  const distribution: ScheduleDistribution = settings.distribution || "fixed";

  const slots: ScheduleSlot[] = [];
  let currentMinute = startMinutes;

  for (let i = 0; i < totalPosts; i++) {
    let slotMinute = currentMinute;

    if (distribution === "randomized") {
      // Jitter aleatório controlado (±1 a 3 minutos) sem violar limites
      const maxJitter = Math.min(3, Math.max(1, Math.floor(intervalMinutes / 5)));
      // Pseudo-randomização determinística baseada no índice e na data para evitar saltos caóticos
      const seed = (i * 17 + parseInt(dateStr.replace(/-/g, ""), 10)) % 100;
      const jitter = (seed % (maxJitter * 2 + 1)) - maxJitter;
      slotMinute = Math.max(startMinutes, slotMinute + jitter);
    }

    // Garante que o slot não ultrapasse o fim da janela
    if (endMinutes <= 24 * 60 && slotMinute >= endMinutes) {
      break;
    }

    const normMinute = slotMinute % (24 * 60);
    const hour = Math.floor(normMinute / 60);
    const min = normMinute % 60;
    const timeStr = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    const dateUtc = createDateInSaoPaulo(dateStr, timeStr);

    slots.push({
      timeStr,
      dateStr,
      dateUtc,
      index: i + 1,
    });

    currentMinute += intervalMinutes;
    if (currentMinute >= startMinutes + totalWindowMinutes) {
      break;
    }
  }

  return slots;
}

/**
 * Calcula o próximo slot vago de publicação distribuído ao longo da janela.
 */
export function calculateNextScheduledSlot(
  existingOffers: Offer[],
  settings: SchedulerSettings,
  now = new Date()
): { scheduledFor: string; windowDate: string; timeStr: string } {
  const spNow = getSaoPauloTime(now);
  const { startMinutes, endMinutes } = calculateWindowMinutes(settings.startHour, settings.endHour);
  const insideWindow = isWithinOperatingWindow(settings, spNow);
  const { totalPosts } = calculateScheduleMetrics(settings);

  // Ofertas já agendadas ou enviadas hoje
  const todayOffers = existingOffers.filter(
    (o) =>
      o.scheduledWindowDate === spNow.dateStr &&
      o.scheduledFor &&
      o.whatsappStatus !== "falhou"
  );

  const todayCount = todayOffers.length;
  const isTodayFull = todayCount >= totalPosts;

  // Se já atingiu a meta de hoje ou está de noite após o término da janela:
  // Agenda para a abertura da janela de amanhã (startHour)
  if (isTodayFull || (!insideWindow && spNow.hour >= 23)) {
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const spNextDay = getSaoPauloTime(nextDay);
    const tomorrowSlots = generateDayScheduleSlots(settings, spNextDay.dateStr);

    const tomorrowOffers = existingOffers.filter(
      (o) => o.scheduledWindowDate === spNextDay.dateStr && o.scheduledFor && o.whatsappStatus !== "falhou"
    );

    const slotIndex = Math.min(tomorrowOffers.length, tomorrowSlots.length - 1);
    const chosenSlot = tomorrowSlots[slotIndex] || tomorrowSlots[0];

    return {
      scheduledFor: chosenSlot.dateUtc.toISOString(),
      windowDate: spNextDay.dateStr,
      timeStr: chosenSlot.timeStr,
    };
  }

  // Madrugada antes do horário de abertura (ex.: entre 00:00 e 07:00)
  if (!insideWindow && spNow.hour >= 0 && spNow.hour * 60 + spNow.minute < startMinutes) {
    const todaySlots = generateDayScheduleSlots(settings, spNow.dateStr);
    const slotIndex = Math.min(todayOffers.length, todaySlots.length - 1);
    const chosenSlot = todaySlots[slotIndex] || todaySlots[0];

    return {
      scheduledFor: chosenSlot.dateUtc.toISOString(),
      windowDate: spNow.dateStr,
      timeStr: chosenSlot.timeStr,
    };
  }

  // Estamos dentro da janela de hoje: encontra o próximo slot futuro disponível
  const todaySlots = generateDayScheduleSlots(settings, spNow.dateStr);
  const nowMs = now.getTime();
  const minValidTime = nowMs + 2 * 60 * 1000; // Margem mínima de 2 minutos para processamento seguro

  // Conjunto de horários já ocupados hoje (com tolerância de 2 min)
  const occupiedTimes = todayOffers
    .map((o) => (o.scheduledFor ? new Date(o.scheduledFor).getTime() : 0))
    .filter((t) => t > 0);

  for (const slot of todaySlots) {
    const slotMs = slot.dateUtc.getTime();
    if (slotMs >= minValidTime) {
      // Verifica se o slot já está ocupado por outra oferta
      const isOccupied = occupiedTimes.some((occ) => Math.abs(occ - slotMs) < 3 * 60 * 1000);
      if (!isOccupied) {
        return {
          scheduledFor: slot.dateUtc.toISOString(),
          windowDate: spNow.dateStr,
          timeStr: slot.timeStr,
        };
      }
    }
  }

  // Se todos os slots restantes de hoje estiverem ocupados, joga para o dia seguinte
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const spTomorrow = getSaoPauloTime(tomorrow);
  const tomorrowSlots = generateDayScheduleSlots(settings, spTomorrow.dateStr);
  const chosenSlot = tomorrowSlots[0];

  return {
    scheduledFor: chosenSlot.dateUtc.toISOString(),
    windowDate: spTomorrow.dateStr,
    timeStr: chosenSlot.timeStr,
  };
}

/**
 * Recalcula os slots de ofertas futuras aprovadas quando as configurações do agendador são alteradas.
 * NÃO altera ofertas já enviadas no dia.
 * NÃO publica nada imediatamente de forma acidental.
 */
export function rescheduleFutureOffers(
  offers: Offer[],
  settings: SchedulerSettings,
  now = new Date()
): Offer[] {
  const spNow = getSaoPauloTime(now);
  const nowMs = now.getTime();

  // Filtra ofertas futuras aprovadas ainda não enviadas
  const futureOffers = offers.filter(
    (o) =>
      o.status === "aprovado" &&
      o.whatsappStatus === "agendado"
  );

  if (futureOffers.length === 0) return offers;

  // Ordena por score decrescente para priorizar maior qualidade primeiro
  futureOffers.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

  // Gera slots futuros de hoje
  const todaySlots = generateDayScheduleSlots(settings, spNow.dateStr).filter(
    (s) => s.dateUtc.getTime() >= nowMs + 2 * 60 * 1000
  );

  // Gera slots de amanhã se necessário
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const spTomorrow = getSaoPauloTime(tomorrow);
  const tomorrowSlots = generateDayScheduleSlots(settings, spTomorrow.dateStr);

  const availableSlots = [...todaySlots, ...tomorrowSlots];
  const updatedMap = new Map<string, { scheduledFor: string; windowDate: string }>();

  futureOffers.forEach((offer, idx) => {
    const slot = availableSlots[idx] || availableSlots[availableSlots.length - 1];
    if (slot) {
      updatedMap.set(offer.id, {
        scheduledFor: slot.dateUtc.toISOString(),
        windowDate: slot.dateStr,
      });
    }
  });

  return offers.map((offer) => {
    const update = updatedMap.get(offer.id);
    if (update) {
      return {
        ...offer,
        scheduledFor: update.scheduledFor,
        scheduledWindowDate: update.windowDate,
        updatedAt: now.toISOString(),
      };
    }
    return offer;
  });
}

/**
 * Computa as estatísticas consolidadas do agendador em tempo real com novos diagnósticos.
 */
export function computeSchedulerStats(
  offers: Offer[],
  settings: SchedulerSettings,
  now = new Date()
): SchedulerStats {
  const spNow = getSaoPauloTime(now);
  const metrics = calculateScheduleMetrics(settings);

  let aprovadasFila = 0;
  let agendadasHoje = 0;
  let enviadasHoje = 0;
  let pendentesProximaJanela = 0;
  let comFalha = 0;
  let proximoEnvio: string | null = null;
  let nextTimeMs = Infinity;

  const todayStart = createDateInSaoPaulo(spNow.dateStr, "00:00").getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;
  const minScore = settings.minScore ?? 75;

  let aprovadasElegiveisScore = 0;

  for (const offer of offers) {
    if (offer.whatsappStatus === "falhou") {
      comFalha++;
    }

    if (offer.status === "aprovado") {
      aprovadasFila++;
      if ((offer.opportunityScore ?? 0) >= minScore) {
        aprovadasElegiveisScore++;
      }

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

  // Gera os horários programados do dia para preview
  const daySlots = generateDayScheduleSlots(settings, spNow.dateStr);
  const proximosHorarios = daySlots
    .filter((s) => s.dateUtc.getTime() >= now.getTime())
    .slice(0, 8)
    .map((s) => s.timeStr);

  // Diagnóstico transparente: motivo quando não houver ofertas elegíveis
  let motivoSemElegivel: string | null = null;
  const insideWindow = isWithinOperatingWindow(settings, spNow);

  if (settings.state === "pausado") {
    motivoSemElegivel = "Agendador pausado pelo administrador.";
  } else if (settings.state === "interrompido_erro") {
    motivoSemElegivel = "Agendador interrompido após falhas consecutivas de envio.";
  } else if (!insideWindow) {
    motivoSemElegivel = `Fora da janela operacional (${settings.startHour} às ${settings.endHour}). Próxima abertura às ${settings.startHour}.`;
  } else if (aprovadasFila === 0) {
    motivoSemElegivel = "Nenhuma oferta aprovada na fila. Aprove produtos no Radar de Ofertas.";
  } else if (aprovadasElegiveisScore === 0) {
    motivoSemElegivel = `Há ${aprovadasFila} oferta(s) na fila, mas todas estão com score abaixo do mínimo (${minScore}/100).`;
  } else if (enviadasHoje >= metrics.totalPosts) {
    motivoSemElegivel = `Meta diária de ${metrics.totalPosts} publicações já foi atingida hoje.`;
  }

  return {
    aprovadasFila,
    agendadasHoje,
    enviadasHoje,
    pendentesProximaJanela,
    comFalha,
    proximoEnvio,
    metaDiaria: metrics.totalPosts,
    limiteHora: settings.maxPerHour || 5,

    mode: settings.mode || "interval_minutes",
    distribution: settings.distribution || "fixed",
    intervalMinutes: metrics.intervalMinutes,
    totalEstimadoDia: metrics.totalPosts,
    proximosHorarios,
    motivoSemElegivel,
    minScore,
    minPendingScore: settings.minPendingScore ?? minScore,
    minAutoPublishScore: settings.minAutoPublishScore ?? minScore,
    minManualPublishScore: settings.minManualPublishScore ?? minScore,
    requireVerifiableDiscount: settings.requireVerifiableDiscount ?? true,
    windowStart: settings.startHour,
    windowEnd: settings.endHour,
  };
}
