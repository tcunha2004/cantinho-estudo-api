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

/*
 * Nada que saia daqui carrega detalhe interno: a mensagem do Postgres traz o
 * nome da constraint, a coluna e o valor que colidiu — mapa do schema mais o
 * dado, que neste sistema é CPF, RG ou e-mail. Vale para a resposta e para o
 * log, que também não é lugar de PII em texto claro.
 */
@Catch()
export class MyExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MyExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const { status, body } = this.resolve(exception, request.url);

    this.logger.error(
      `${request.method} ${request.url} -> ${status} | ${
        exception instanceof Error ? exception.name : 'Unknown'
      }`,
    );

    /*
     * Stack só no 500: ali a exceção é bug nosso e é o stack que resolve. O
     * erro de banco não entra — a mensagem dele é justamente a que carrega o
     * valor que colidiu. Para depurar aquele caso, log do Postgres.
     */
    if (
      status === HttpStatus.INTERNAL_SERVER_ERROR &&
      exception instanceof Error
    ) {
      this.logger.error(exception.stack);
    }

    response.status(status).json(body);
  }

  private resolve(
    exception: unknown,
    path: string,
  ): { status: HttpStatus; body: unknown } {
    if (exception instanceof HttpException) {
      return { status: exception.getStatus(), body: exception.getResponse() };
    }

    const [status, message] =
      exception instanceof QueryFailedError
        ? [HttpStatus.CONFLICT, 'Não foi possível concluir a operação']
        : [HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'];

    return {
      status,
      body: {
        statusCode: status,
        message,
        timestamp: new Date().toISOString(),
        path,
      },
    };
  }
}
