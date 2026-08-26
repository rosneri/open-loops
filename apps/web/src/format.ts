export const clockTime = (epochMillis: number, timeZone: string): string =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(epochMillis),
  );

export const relativeDue = (epochMillis: number, now: number): string => {
  const minutes = Math.round((epochMillis - now) / 60_000);
  const magnitude = Math.abs(minutes);
  const unit =
    magnitude < 60
      ? `${magnitude}m`
      : magnitude < 1440
        ? `${Math.round(magnitude / 60)}h`
        : `${Math.round(magnitude / 1440)}d`;
  return minutes < 0 ? `${unit} overdue` : `in ${unit}`;
};

export const titleCase = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
