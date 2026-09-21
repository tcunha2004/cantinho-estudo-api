import { Injectable } from '@nestjs/common';
import { UserEntity, UserRole } from './entity/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSummaryDto } from './dto/user-summary.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /* Todos os usuários para a tela de senhas do admin. O hash fica fora do DTO:
   * ele não serve a ninguém na resposta e vazá-lo permitiria ataque offline. */
  public async findAll(): Promise<UserSummaryDto[]> {
    const users = await this.userRepository.find({ order: { name: 'ASC' } });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }));
  }

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
