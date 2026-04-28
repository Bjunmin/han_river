import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { envVariableKeys } from 'src/common/const/env.const';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt'
import { UserSetting } from './entities/user-setting.entity';
import { UpdateUserSettingDto } from './dto/update-user-setting.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
    private readonly configService: ConfigService
  ) { }

  async create(createUserDto: CreateUserDto) {
    const { phoneNumber, password } = createUserDto;

    const user = await this.userRepository.findOne({
      where: {
        phoneNumber
      }
    })

    if (user) {
      throw new BadRequestException("이미 존재하는 휴대폰번호입니다.");
    }

    const hash_rounds = this.configService.get<number>(envVariableKeys.hashRounds)
    const hash_password = await bcrypt.hash(password, +hash_rounds)

    const newUser = await this.userRepository.save({
      ...createUserDto,
      password: hash_password
    })


    await this.userSettingRepository.save({
      user: newUser,
      nickName: newUser.name
    })

    return newUser
  }

  findAll() {
    return this.userRepository.find()
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOne({
      where: {
        id
      }
    })

    if (!user) {
      throw new NotFoundException("해당 아이디는 존재하지 않습니다.");
    }

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({
      where: {
        id
      }
    })

    if (!user) {
      throw new NotFoundException("해당 아이디는 존재하지 않습니다.");
    }

    const { password } = updateUserDto

    let updateData = {
      ...updateUserDto
    }

    if (password) {
      const hash_rounds = this.configService.get<number>(envVariableKeys.hashRounds);
      const hash_password = await bcrypt.hash(password, +hash_rounds);

      updateData.password = hash_password;
    }

    const updateUser = await this.userRepository.update(
      {
        id
      },
      updateData

    )

    return updateUser;
  }

  async updateSetting(id: number, updateUserSettingDto: UpdateUserSettingDto) {
    const userSetting = await this.userSettingRepository.findOne({
      where: {
        id
      }
    })

    if (!userSetting) {
      throw new NotFoundException("해당 설정은 존재하지 않습니다.");
    }

    const updateUserSetting = await this.userSettingRepository.update(
      {
        id
      },
      updateUserSettingDto
    )

    return updateUserSetting;
  }


  async remove(id: number) {
    const user = await this.userRepository.findOne({
      where: {
        id
      }
    })

    if (!user) {
      throw new NotFoundException("해당 아이디는 존재하지 않습니다.");
    }

    await this.userRepository.delete(id)

    return id;
  }
}
