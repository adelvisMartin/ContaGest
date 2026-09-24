import { classifyRaceQueryIntent, type RaceQueryIntent } from './race-lifecycle.js';
import { RaceLifecycleStore } from './race.store.js';

type RaceQueryStore = Pick<RaceLifecycleStore, 'listRaces' | 'listMeetings' | 'getMeeting'>;

export type RaceQueryRequest = {
  ownerId: string;
  groupKey: string;
  text: string;
  meetingId?: string | null;
  raceId?: string | null;
};

export type RaceQueryResult = {
  intent: RaceQueryIntent;
  answer: unknown;
  scope: {
    ownerId: string;
    groupId: string;
    meetingId: string | null;
    raceId: string | null;
  };
};

function queryError(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function resultData(race: any) {
  return race?.resultData && typeof race.resultData === 'object' ? race.resultData : {};
}

function exactRaceContext(races: any[], intent: RaceQueryIntent, raceId: string | null) {
  if (raceId) {
    const match = races.find((race) => race.id === raceId);
    if (!match) queryError('HIPICO_RACE_NOT_FOUND');
    return match;
  }
  const resultIntent = intent === 'RESULT' || intent === 'OFFICIALITY';
  const candidates = resultIntent
    ? races.filter((race) => ['PROVISIONAL_RESULT', 'OFFICIAL_RESULT', 'ARCHIVED'].includes(race.state) || race.resultStage !== 'none')
    : races.filter((race) => ['OPEN', 'CLOSING', 'RUNNING'].includes(race.state));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) queryError('RACE_QUERY_CONTEXT_REQUIRED');
  queryError('RACE_QUERY_AMBIGUOUS');
}

function nextRace(races: any[]) {
  const candidates = [...races]
    .filter((race) => race.state === 'DISCOVERED' || race.state === 'ANNOUNCED')
    .sort((a, b) =>
      Date.parse(a.scheduledAt || '9999-12-31') - Date.parse(b.scheduledAt || '9999-12-31')
      || Number(a.number || 0) - Number(b.number || 0)
    );
  if (
    candidates.length > 1
    && String(candidates[0].scheduledAt || '') === String(candidates[1].scheduledAt || '')
    && candidates[0].meetingId !== candidates[1].meetingId
  ) queryError('RACE_QUERY_AMBIGUOUS');
  return candidates[0] || null;
}

export class RaceQueryService {
  constructor(private readonly store: RaceQueryStore = new RaceLifecycleStore()) {}

  async execute(input: RaceQueryRequest): Promise<RaceQueryResult> {
    const intent = classifyRaceQueryIntent(input.text);
    const meetingId = input.meetingId || null;
    const raceId = input.raceId || null;
    const races = await this.store.listRaces(input.ownerId, input.groupKey, meetingId, 200);
    let answer: any = null;

    if (intent === 'ACTIVE_RACE') {
      const candidates = races.filter((race: any) => ['OPEN', 'CLOSING', 'RUNNING'].includes(race.state));
      if (candidates.length > 1) queryError('RACE_QUERY_AMBIGUOUS');
      answer = candidates[0] || null;
    } else if (intent === 'NEXT_RACE') {
      answer = nextRace(races);
    } else if (intent === 'LAST_RESULT') {
      answer = races.find((race: any) =>
        ['PROVISIONAL_RESULT', 'OFFICIAL_RESULT', 'ARCHIVED'].includes(race.state)
        || race.resultStage !== 'none'
      ) || null;
    } else if (intent === 'SCHEDULE') {
      answer = races;
    } else if (intent === 'MEETING_STATUS') {
      if (meetingId) {
        const meeting = await this.store.getMeeting(input.ownerId, input.groupKey, meetingId);
        if (!meeting) queryError('HIPICO_MEETING_NOT_FOUND');
        answer = { ...meeting, races };
      } else {
        const meetings = await this.store.listMeetings(input.ownerId, input.groupKey, 20);
        if (meetings.length !== 1) queryError(meetings.length ? 'RACE_QUERY_AMBIGUOUS' : 'RACE_QUERY_CONTEXT_REQUIRED');
        answer = {
          ...meetings[0],
          races: await this.store.listRaces(input.ownerId, input.groupKey, meetings[0].id, 200)
        };
      }
    } else if (['STATUS', 'SCHEDULED_TIME', 'RUNNERS', 'SCRATCHES', 'ODDS', 'RESULT', 'OFFICIALITY'].includes(intent)) {
      const race = exactRaceContext(races, intent, raceId);
      const data = resultData(race);
      if (intent === 'STATUS') {
        answer = {
          id: race.id,
          meetingId: race.meetingId,
          number: race.number,
          name: race.name,
          state: race.state,
          resultStage: race.resultStage,
          scheduledAt: race.scheduledAt
        };
      } else if (intent === 'SCHEDULED_TIME') {
        answer = { raceId: race.id, known: Boolean(race.scheduledAt), scheduledAt: race.scheduledAt || null };
      } else if (intent === 'RESULT') {
        answer = { raceId: race.id, known: race.resultStage !== 'none', resultStage: race.resultStage, result: data, state: race.state };
      } else if (intent === 'OFFICIALITY') {
        answer = { raceId: race.id, resultStage: race.resultStage, official: race.resultStage === 'official' };
      } else if (intent === 'RUNNERS') {
        answer = Array.isArray((data as any).runners)
          ? { raceId: race.id, known: true, runners: (data as any).runners }
          : { raceId: race.id, known: false, reason: 'RUNNERS_REQUIRE_CANONICAL_PROVIDER_OR_DOCUMENT_EVIDENCE' };
      } else if (intent === 'SCRATCHES') {
        answer = Array.isArray((data as any).scratches)
          ? { raceId: race.id, known: true, scratches: (data as any).scratches }
          : { raceId: race.id, known: false, reason: 'SCRATCHES_REQUIRE_CANONICAL_PROVIDER_OR_DOCUMENT_EVIDENCE' };
      } else {
        answer = (data as any).odds
          ? { raceId: race.id, known: true, odds: (data as any).odds }
          : { raceId: race.id, known: false, reason: 'ODDS_REQUIRE_CANONICAL_PROVIDER_EVIDENCE' };
      }
    } else {
      answer = { known: false, reason: 'QUERY_INTENT_UNKNOWN' };
    }

    return {
      intent,
      answer,
      scope: {
        ownerId: input.ownerId,
        groupId: input.groupKey,
        meetingId,
        raceId
      }
    };
  }
}

function raceLabel(race: any) {
  if (!race) return '';
  return [race.number ? `${race.number}ª carrera` : '', String(race.name || '').trim()].filter(Boolean).join(' · ');
}

function scheduledLabel(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().replace('.000Z', 'Z') : raw.slice(0, 80);
}

function compactJson(value: unknown, max = 900) {
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return '';
  }
}

export function formatRaceQueryResponse(result: RaceQueryResult): string {
  const answer: any = result.answer;
  if (result.intent === 'NEXT_RACE') {
    if (!answer) return 'No hay una próxima carrera registrada con evidencia disponible.';
    const when = scheduledLabel(answer.scheduledAt);
    return `Próxima carrera: ${raceLabel(answer)}${when ? ` · programada ${when}` : ''}.`;
  }
  if (result.intent === 'ACTIVE_RACE') {
    if (!answer) return 'No hay una carrera activa registrada en este momento.';
    return `Carrera activa: ${raceLabel(answer)} · estado ${String(answer.state || 'desconocido')}.`;
  }
  if (result.intent === 'LAST_RESULT') {
    if (!answer) return 'No hay un resultado registrado todavía.';
    const board = Array.isArray(answer?.resultData?.arrival)
      ? answer.resultData.arrival.join('-')
      : Array.isArray(answer?.resultData?.board)
        ? answer.resultData.board.join('-')
        : '';
    return `Último resultado: ${raceLabel(answer)} · etapa ${String(answer.resultStage || 'none')}${board ? ` · llegada ${board}` : ''}.`;
  }
  if (result.intent === 'SCHEDULE') {
    const races = Array.isArray(answer) ? answer.slice(0, 12) : [];
    if (!races.length) return 'No hay programación de carreras registrada.';
    const lines = races.map((race: any) => {
      const when = scheduledLabel(race.scheduledAt);
      return `• ${raceLabel(race)}${when ? ` · ${when}` : ''} · ${String(race.state || 'sin estado')}`;
    });
    return ['Programación registrada:', ...lines].join('\n').slice(0, 3900);
  }
  if (result.intent === 'SCHEDULED_TIME') {
    return answer?.known
      ? `Hora programada registrada: ${scheduledLabel(answer.scheduledAt)}.`
      : 'No hay una hora programada verificada para esa carrera.';
  }
  if (result.intent === 'STATUS') {
    return `Estado de la carrera: ${raceLabel(answer)} · ${String(answer?.state || 'desconocido')} · resultado ${String(answer?.resultStage || 'none')}.`;
  }
  if (result.intent === 'OFFICIALITY') {
    return answer?.official
      ? 'El resultado está marcado como oficial en Control Hípico.'
      : `El resultado todavía no está marcado como oficial. Etapa actual: ${String(answer?.resultStage || 'none')}.`;
  }
  if (result.intent === 'RESULT') {
    if (!answer?.known) return 'Todavía no hay un resultado verificado para esa carrera.';
    return `Resultado registrado (${String(answer.resultStage || 'unknown')}): ${compactJson(answer.result) || 'sin detalle estructurado'}.`;
  }
  if (result.intent === 'RUNNERS') {
    if (!answer?.known) return 'No tengo inscritos verificados para esa carrera en la fuente canónica.';
    return `Inscritos verificados: ${compactJson(answer.runners)}.`;
  }
  if (result.intent === 'SCRATCHES') {
    if (!answer?.known) return 'No tengo retiros verificados para esa carrera en la fuente canónica.';
    return `Retiros verificados: ${compactJson(answer.scratches)}.`;
  }
  if (result.intent === 'ODDS') {
    if (!answer?.known) return 'No tengo momios verificados para esa carrera en la fuente canónica.';
    return `Momios verificados: ${compactJson(answer.odds)}.`;
  }
  if (result.intent === 'MEETING_STATUS') {
    if (!answer) return 'No hay una reunión hípica registrada.';
    const races = Array.isArray(answer.races) ? answer.races : [];
    return `Reunión: ${String(answer.name || 'sin nombre')} · ${races.length} carrera(s) registradas.`;
  }
  return 'No pude resolver la consulta con evidencia canónica suficiente.';
}

export const __test__ = { exactRaceContext, nextRace, raceLabel, scheduledLabel, compactJson };
