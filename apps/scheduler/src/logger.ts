import type { Logger } from '@open-loops/kernel';

/** Same NDJSON shape the API emits, so both processes read the same way in a terminal. */
export class ConsoleLogger implements Logger {
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

  private write(level: string, message: string, context?: Record<string, unknown>): void {
    process.stdout.write(`${JSON.stringify({ level, message, ...context })}\n`);
  }
}
