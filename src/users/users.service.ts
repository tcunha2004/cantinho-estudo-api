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

  public async findById(id: string): Promise<UserEntity | null> {
    return await this.userRepository.findOne({ where: { id } });
  }

  public async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.userRepository.update({ id }, { password: passwordHash });
  }
}
