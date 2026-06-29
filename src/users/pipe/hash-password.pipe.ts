import { Injectable, PipeTransform } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

const DEFAULT_SALT_ROUNDS = 10;

@Injectable()
export class HashPasswordPipe implements PipeTransform {
  constructor(private readonly configService: ConfigService) {}

  async transform(password: string): Promise<string> {
    const configured = Number(
      this.configService.get<string>('BCRYPT_SALT_ROUNDS'),
    );
    const rounds =
      Number.isInteger(configured) && configured > 0
        ? configured
        : DEFAULT_SALT_ROUNDS;
    return bcrypt.hash(password, rounds);
  }
}
