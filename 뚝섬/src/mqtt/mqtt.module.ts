import { ClientsModule, Transport } from '@nestjs/microservices';
import { Module } from '@nestjs/common';
import { MqttController } from './mqtt.controller';
import { CacheModule } from '@nestjs/cache-manager';
import { MqttService } from './mqtt.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonService } from 'src/common/common.service';
import { User } from 'src/user/entities/user.entity';

const clients = ClientsModule.register([
    {
        name: 'MQTT_SERVICE', //* MQTT_SERVICE : 의존성 이름
        transport: Transport.MQTT,
        options: {
            host: 'localhost',
            port: 1883,
        },
    },
]);

@Module({
    imports: [
        clients,
        // CacheModule.register({
        //     ttl: 0,
        //     isGlobal: true,
        // }),
        TypeOrmModule.forFeature(
            [
                User
            ]
        )
    ],
    controllers: [MqttController],
    providers: [MqttService, CommonService],
    exports: [clients], // 다른 모듈에서 쓸 수 있게 출력
})
export class MqttModule {
    constructor() { }
}
