import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { ConfigService } from '@nestjs/config';
import { UserSetting } from './entities/user-setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        User,
        UserSetting
      ]
    )
  ],
  controllers: [UserController],
  providers: [UserService, ConfigService],
})
export class UserModule { }
