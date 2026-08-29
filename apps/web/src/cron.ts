/**
 * A cron expression is unreadable to most people, and a settings screen that shows one without
 * saying what it means is a trap. This describes the common shapes in words and falls back to
 * the raw expression rather than guessing — a wrong description is worse than none.
 */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface CronFields {
  readonly minute: string;
  readonly hour: string;
  readonly dayOfMonth: string;
  readonly month: string;
  readonly dayOfWeek: string;
  /** True when the expression puts no constraint on which day it runs. */
  readonly everyDay: boolean;
}

type Rule = (fields: CronFields) => string | undefined;

/** Ordered most specific to least; the first rule that recognises the shape wins. */
const RULES: readonly Rule[] = [
  ({ minute, hour, everyDay }) =>
    minute.startsWith('*/') && hour === '*' && everyDay
      ? `every ${minute.slice(2)} minutes`
      : undefined,
  ({ minute, hour, everyDay }) =>
    minute === '*' && hour === '*' && everyDay ? 'every minute' : undefined,
  ({ minute, hour, everyDay }) =>
    isNumber(minute) && hour === '*' && everyDay ? `hourly, at ${pad(minute)} past` : undefined,
  ({ minute, hour, everyDay }) =>
    isNumber(minute) && hour.startsWith('*/') && everyDay
      ? `every ${hour.slice(2)} hours, at ${pad(minute)} past`
      : undefined,
  ({ minute, hour, everyDay }) =>
    isNumber(minute) && isNumber(hour) && everyDay
      ? `daily at ${pad(hour)}:${pad(minute)}`
      : undefined,
  ({ minute, hour, dayOfMonth, month, dayOfWeek }) => {
    if (!isNumber(minute) || !isNumber(hour) || dayOfMonth !== '*' || month !== '*') return undefined;
    const named = namedDays(dayOfWeek);
    return named === undefined ? undefined : `${named} at ${pad(hour)}:${pad(minute)}`;
  },
];

export const describeCron = (expression: string): string => {
  const fields = parse(expression);
  if (fields === undefined) return expression;

  for (const rule of RULES) {
    const described = rule(fields);
    if (described !== undefined) return described;
  }
  return expression;
};

const parse = (expression: string): CronFields | undefined => {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return undefined;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
    everyDay: dayOfMonth === '*' && month === '*' && dayOfWeek === '*',
  };
};

const namedDays = (field: string): string | undefined => {
  if (field === '1-5') return 'weekdays';
  if (field === '0,6' || field === '6,0') return 'weekends';

  const days = field.split(',');
  if (!days.every(isNumber)) return undefined;
  const names = days.map((day) => DAYS[Number(day) % 7]).filter((name) => name !== undefined);
  return names.length === days.length ? names.join(', ') : undefined;
};

const isNumber = (value: string): boolean => /^\d+$/.test(value);
const pad = (value: string): string => value.padStart(2, '0');

export const PRESETS: readonly { readonly label: string; readonly cron: string }[] = [
  { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Every 3 hours', cron: '0 */3 * * *' },
  { label: 'Weekdays at 08:00', cron: '0 8 * * 1-5' },
  { label: 'Daily at 07:00', cron: '0 7 * * *' },
];
