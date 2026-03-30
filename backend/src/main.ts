import './common/helpers/bootstrap-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createOriginMatcher(pattern: string) {
  if (pattern === '*') {
    return () => true;
  }

  if (!pattern.includes('*')) {
    return (requestOrigin: string) => requestOrigin === pattern;
  }

  const regexPattern = `^${pattern.split('*').map(escapeRegExp).join('.*')}$`;
  const regex = new RegExp(regexPattern);

  return (requestOrigin: string) => regex.test(requestOrigin);
}

function parseCorsOrigins(value?: string) {
  if (!value || value === '*') {
    return true;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!origins.length) {
    return true;
  }

  const matchers = origins.map((origin) => createOriginMatcher(origin));

  return (requestOrigin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!requestOrigin || matchers.some((matcher) => matcher(requestOrigin))) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${requestOrigin} is not allowed by CORS.`));
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();

  if (typeof expressApp?.disable === 'function') {
    expressApp.disable('x-powered-by');
  }

  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Content-Disposition'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT || 4000, '0.0.0.0');
}

bootstrap();
