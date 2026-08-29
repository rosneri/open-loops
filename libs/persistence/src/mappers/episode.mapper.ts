import { asDayKey, optional } from '@open-loops/kernel';
import type { EpisodeProps, EpisodeStatus } from '@open-loops/podcast';
import { Episode } from '@open-loops/podcast';
import type { PodcastEpisode as EpisodeRow } from '../generated/prisma/client.js';
import { toDate, toInstant } from './primitives.js';

export const toDomain = (row: EpisodeRow): Episode =>
  Episode.rehydrate({
    id: row.id,
    day: asDayKey(row.day),
    status: row.status as EpisodeStatus,
    title: row.title,
    brief: row.brief,
    requestedAt: toInstant(row.requestedAt),
    ...optional('audioUrl', row.audioUrl),
    ...optional('durationSeconds', row.durationSeconds),
    ...optional('externalRef', row.externalRef),
    ...optional('error', row.error),
    ...optional('completedAt', row.completedAt === null ? null : toInstant(row.completedAt)),
  });

export const toRow = (props: EpisodeProps): Omit<EpisodeRow, 'ownerId'> => ({
  id: props.id,
  day: props.day,
  status: props.status,
  title: props.title,
  brief: props.brief,
  audioUrl: props.audioUrl ?? null,
  durationSeconds: props.durationSeconds ?? null,
  externalRef: props.externalRef ?? null,
  error: props.error ?? null,
  requestedAt: toDate(props.requestedAt),
  completedAt: props.completedAt === undefined ? null : toDate(props.completedAt),
});
