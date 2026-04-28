import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { CommonService } from 'src/common/common.service';
import { Role, User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { envVariableKeys } from 'src/common/const/env.const';
import { LoginDto } from './dto/login.dto';
import { UserSetting } from 'src/user/entities/user-setting.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly commonService: CommonService,
  ) { }

  parseBasicToken(rawToken: string) {
    /// 1) 토큰을 ' ' 기준으로 스플릿 한 후 토큰 값만 추출하기
    /// ['Basic', $token]
    const basicSplit = rawToken.split(' ');

    if (basicSplit.length !== 2) {
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');
    }

    const [basic, token] = basicSplit;

    if (basic.toLowerCase() !== 'basic') {
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');
    }

    /// 2) 추출한 토큰을 base64 디코딩해서 이메일과 비밀번호로 나눈다.
    const decoded = Buffer.from(token, 'base64').toString('utf-8');

    /// "email:password"
    /// [email, password]
    const tokenSplit = decoded.split(':');

    if (tokenSplit.length !== 2) {
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!')
    }

    const [email, password] = tokenSplit;

    return {
      email,
      password,
    }
  }

  async parseBearerToken(rawToken: string, isRefreshToken: boolean) {
    const basicSplit = rawToken.split(' ');

    if (basicSplit.length !== 2) {
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');
    }

    const [bearer, token] = basicSplit;

    if (bearer.toLowerCase() !== 'bearer') {
      throw new BadRequestException('토큰 포맷이 잘못됐습니다!');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>(
          isRefreshToken ? envVariableKeys.refreshTokenSecret : envVariableKeys.accessTokenSecret,
        ),
      });

      if (isRefreshToken) {
        if (payload.type !== 'refresh') {
          throw new BadRequestException('Refresh 토큰을 입력 해주세요!');
        }
      } else {
        if (payload.type !== 'access') {
          throw new BadRequestException('Access 토큰을 입력 해주세요!')
        }
      }

      return payload;
    } catch (e) {
      throw new UnauthorizedException('토큰이 만료됐습니다!');
    }
  }

  async register(createUserDto: CreateUserDto) {
    const user = await this.userRepository.findOne({
      where: {
        phoneNumber:
          createUserDto.phoneNumber
      }
    })

    if (user) {
      throw new BadRequestException('이미 가입한 번호 입니다');
    }
    const hash = await bcrypt.hash(createUserDto.password, +this.configService.get<number>(envVariableKeys.hashRounds))

    const newUser = await this.userRepository.save({
      ...createUserDto,
      password: hash,
    });


    await this.userSettingRepository.save({
      user: newUser,
      nickname: newUser.name
    })

    return newUser
  }

  async authenticate(phoneNumber: string, password: string) {
    const user = await this.userRepository.findOne({
      where: {
        phoneNumber,
      },
    });

    if (!user) {
      throw new BadRequestException('잘못된 로그인 정보입니다!');
    }

    const passOk = await bcrypt.compare(password, user.password);



    if (!passOk) {
      throw new BadRequestException('잘못된 로그인 정보입니다!');
    }

    return user;
  }

  async issueToken(user: { phoneNumber: String, role: Role }, isRefreshToken: boolean) {
    const refreshTokenSecret = this.configService.get<string>(envVariableKeys.refreshTokenSecret);
    const accessTokenSecret = this.configService.get<string>(envVariableKeys.accessTokenSecret);

    return this.jwtService.signAsync({
      sub: user.phoneNumber,
      role: user.role,
      type: isRefreshToken ? 'refresh' : 'access',
    }, {
      secret: isRefreshToken ? refreshTokenSecret : accessTokenSecret,
      expiresIn: isRefreshToken ? '24h' : 3000,
    })
  }

  async login(loginDto: LoginDto) {
    const { phoneNumber, password } = loginDto;

    const user = await this.authenticate(phoneNumber, password);

    return {
      refreshToken: await this.issueToken(user, true),
      accessToken: await this.issueToken(user, false)
    }
  }

  async profile(phoneNumber: string) {
    const user = await this.userRepository.findOne({
      where: {
        phoneNumber
      }
    })

    if (!user) {
      throw new BadRequestException('로그인 회원이 아닙니다.');
    }

    return user;
  }

  async findID(name: string, phoneNumber: string) {
    const user = await this.userRepository.findOne({
      where: {
        name: name,
        phoneNumber
      }
    })

    if (!user) {
      throw new NotFoundException('가입된 정보가 없습니다.');
    }

    return user.phoneNumber
  }

  async findPassword(name: string, phoneNumber: string) {
    const accessTokenSecret = this.configService.get<string>(envVariableKeys.accessTokenSecret);

    const user = await this.userRepository.findOne({
      where: {
        name: name,
        phoneNumber
      }
    })

    if (!user) {
      throw new NotFoundException('가입된 정보가 없습니다.');
    }

    const token = this.jwtService.sign({
      sub: user.id
    }, {
      secret: accessTokenSecret,
      expiresIn: '10m'
    })
    // const domain = this.configService.get<string>(envVariableKeys.d_omain) ?? "115.90.180.4"

    // const resetLink = `https://${domain}/reset-password?token=${token}`;

    // this.commonService.sendPasswordResetMail('hkh2796@naver.com', resetLink);

    return { message: '비밀번호 재설정 링크를 이메일로 보냈습니다.' };

  }

  async resetPassword(token: string, newPassword: string) {

    const accessTokenSecret = this.configService.get<string>(envVariableKeys.accessTokenSecret);

    try {
      const payload = await this.jwtService.verify(token, {
        secret: accessTokenSecret,
      })

      const userId = payload.sub;
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('사용자를 찾을 수 없습니다.');
      }

      const hash = await bcrypt.hash(newPassword, +this.configService.get<number>(envVariableKeys.hashRounds))
      user.password = hash; // 실제 서비스에서는 해싱이 필요
      console.log(hash);
      await this.userRepository.save(user);

      return { message: '비밀번호가 성공적으로 변경되었습니다.' };
    } catch (error) {
      console.log(error);
      throw new BadRequestException('유효하지 않은 또는 만료된 토큰입니다.');
    }
  }
}
