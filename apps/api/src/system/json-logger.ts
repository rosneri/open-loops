import type { Logger } from '@open-loops/kernel';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Structured single-line JSON, which is what makes the tick's output greppable. */
export class JsonLogger implements Logger {
  public constructor(private readonly minimum: Level = 'info') {}

  public debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }

  private write(level: Level, message: string, context?: Record<string, unknown>): void {
    if (ORDER[level] < ORDER[this.minimum]) return;
    const line = JSON.stringify({ level, message, ...context });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else process.stdout.write(`${line}\n`);
  }
}
