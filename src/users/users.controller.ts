import { Body, Controller, Post } from '@nestjs/common';
import { UserEntity } from './entity/user.entity';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('create')
  public async createUser(@Body() data: CreateUserDto): Promise<UserEntity> {
    return this.usersService.createUser(data);
  }
}
