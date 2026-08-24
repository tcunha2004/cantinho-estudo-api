import { Injectable } from '@nestjs/common';
import { UserEntity, UserRole } from './entity/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  public async findByEmailAndRole(
    email: string,
    role: UserRole,
  ): Promise<UserEntity | null> {
    return await this.userRepository.findOne({ where: { email, role } });
  }
}
