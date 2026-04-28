import { Global, Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { CommonController } from './common.controller';
import { TasksService } from './tasks.service';
import { MqttModule } from 'src/mqtt/mqtt.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSetting } from 'src/user/entities/user-setting.entity';
import { WsServerProvider } from './ws/ws-server.provider';
import { ConfigModule } from '@nestjs/config';
import { ErrorLoggerService } from './logger/error-logger.service';

@Global()
@Module({
  imports: [
    MqttModule,
    ConfigModule,
    TypeOrmModule.forFeature([
      UserSetting
    ])
  ],
  controllers: [CommonController],
  providers: [CommonService, TasksService, WsServerProvider, ErrorLoggerService],
  exports: [CommonService, WsServerProvider, ErrorLoggerService]
})
export class CommonModule { }
