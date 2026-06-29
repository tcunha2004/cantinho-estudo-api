import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class MyExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MyExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const { status, body } =
      exception instanceof HttpException
        ? {
            status: exception.getStatus(),
            body: exception.getResponse(),
          }
        : exception instanceof QueryFailedError
          ? {
              status: HttpStatus.CONFLICT,
              body: {
                statusCode: HttpStatus.CONFLICT,
                message: 'Database query failed',
                timestamp: new Date().toISOString(),
                path: request.url,
              },
            }
          : {
              status: HttpStatus.INTERNAL_SERVER_ERROR,
              body: {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Internal server error',
                timestamp: new Date().toISOString(),
                path: request.url,
              },
            };

    this.logger.error(
      `${request.method} ${request.url} -> ${status} | body: ${JSON.stringify(body)}`,
    );
    response.status(status).json(body);
  }
}
