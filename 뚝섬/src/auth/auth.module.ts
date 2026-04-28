import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { JwtStrategy } from './strategy/jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { CommonService } from 'src/common/common.service';
import { UserSetting } from 'src/user/entities/user-setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSetting
    ]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, CommonService],
  exports: [AuthService, JwtModule]
})
export class AuthModule { }
