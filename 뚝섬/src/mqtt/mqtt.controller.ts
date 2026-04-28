import { Controller, Inject, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload, ClientProxy } from '@nestjs/microservices';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { take } from 'rxjs';

@Controller()
export class MqttController {
    constructor(
        @Inject('MQTT_SERVICE') private client: ClientProxy,
        @Inject(CACHE_MANAGER)
        private readonly cacheManager: Cache
    ) {
    }

    // @MessagePattern('sensor/data') //구독하는 주제2
    // @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
    // async getSensorMeasure(@Payload() data: UpdateSensorDto) {
    //     const { serialNumber, ...restData } = data
    //     const measurement = await this.cacheManager.get(serialNumber)
    //     try {
    //         if (!measurement || measurement != `${restData.temperature}:${restData.d_o}`) {
    //             const phoneNumber = await this.sensorService.updateMeasure(data.serialNumber, restData)
    //             // await this.cacheManager.set(serialNumber, {
    //             //     phoneNumber: phoneNumber,
    //             //     data: {
    //             //         ...restData
    //             //     }
    //             // })
    //             await this.cacheManager.set(serialNumber, `${restData.temperature}:${restData.d_o}`)
    //             this.sensorService.sendSensorData(phoneNumber, data)
    //             console.log(data);
    //         }
    //     } catch (e) {
    //         console.log("센서값 처리 오류: ", e);
    //     }
    // }
}