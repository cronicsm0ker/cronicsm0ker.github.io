import { pino, type LoggerOptions } from 'pino';
import { loadEnv } from './env.js';

const env = loadEnv();

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.tokenHash',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: env.OTEL_SERVICE_NAME,
    env: env.NODE_ENV,
  },
};

if (env.NODE_ENV === 'development') {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname,service',
    },
  };
}

export const logger = pino(options);
export type Logger = typeof logger;
