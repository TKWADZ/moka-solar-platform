import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContextService: RequestContextService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = req.headers['user-agent'] || null;

    this.requestContextService.run(
      {
        ipAddress,
        userAgent: typeof userAgent === 'string' ? userAgent : null,
      },
      next,
    );
  }
}
