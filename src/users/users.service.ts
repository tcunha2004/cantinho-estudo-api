import { Injectable } from '@nestjs/common';
import { UserEntity } from './entity/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  public async createUser(data: CreateUserDto): Promise<UserEntity> {
    const user = this.userRepository.create(data);
    await this.userRepository.save(user);
    return user;
  }
}
