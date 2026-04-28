import { Controller, Get, Post, Body, Patch, Param, Delete, Request } from '@nestjs/common';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  registerUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto)
  }

  @Post('login')
  loginUser(@Body() loginDto: LoginDto) {
    console.log(loginDto)
    return this.authService.login(loginDto);
  }


  @Post('token/access')
  async rotateAccessToken(@Request() req) {
    return {
      accessToken: await this.authService.issueToken(req.user, false),
    }
  }

  @Get('profile')
  async private(@Request() req) {
    return this.authService.profile(req.user.sub)
  }

  @Post('find/id')
  async findID(@Body('name') name: string, @Body('phoneNumber') phoneNumber: string) {
    return this.authService.findID(name, phoneNumber);
  }


  @Post('find/password')
  async findPassword(@Body('name') name: string, @Body('email') email: string) {
    return this.authService.findPassword(name, email);
  }

  @Post('reset-password')
  async resetPassword(@Body('token') token: string, @Body('password') newPassword: string) {
    return this.authService.resetPassword(token, newPassword);
  }
}
