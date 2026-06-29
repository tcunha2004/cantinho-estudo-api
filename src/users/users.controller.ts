import { Body, Controller, Post } from '@nestjs/common';
import { UserEntity } from './entity/user.entity';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { HashPasswordPipe } from './pipe/hash-password.pipe';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('create')
  public async createUser(
    @Body() { password, ...rest }: CreateUserDto,
    @Body('password', HashPasswordPipe) hashedPassword: string,
  ): Promise<UserEntity> {
    return this.usersService.createUser({ password: hashedPassword, ...rest });
  }
}
