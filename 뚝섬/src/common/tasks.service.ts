import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy, MessagePattern, Payload } from "@nestjs/microservices";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { time } from "console";
import { readdir, unlink } from 'fs/promises';
import { join, parse } from "path";
import { take } from "rxjs";
import { UserSetting } from "src/user/entities/user-setting.entity";
import { DataSource, Repository } from "typeorm";

@Injectable()
export class TasksService {
    constructor(
        @Inject('MQTT_SERVICE')
        private client: ClientProxy,
        @InjectRepository(UserSetting)
        private readonly userSettingRepository: Repository<UserSetting>,
        private readonly dataSource: DataSource
    ) { }

    // // 초 분 시 일 월 요일 => 매분마다 수질 이력 저장
    // @Cron('0 * * * * *')
    // async saveWaterQuality() {
    //     const users = await this.userSettingRepository.find({
    //         relations: ['user']
    //     });
    //     const now = Math.floor(Date.now() / 1000);
    //     let sensorArray = [];

    //     for (const userSetting of users) {
    //         const { user, interval } = userSetting;
    //         if (now % interval == 0) {
    //             const sensors = await this.sensorRepository.find({
    //                 where: {
    //                     user: {
    //                         id: user.id
    //                     }
    //                 }
    //             });
    //             for (const sensor of sensors) {
    //                 const { temperature, d_o, ph, salinity } = sensor;
    //                 const waterquality = { temperature, d_o, ph, salinity, sensor }
    //                 sensorArray.push(waterquality);
    //             }
    //         }
    //     }

    //     const queryRunner = this.dataSource.createQueryRunner();
    //     await queryRunner.connect();

    //     try {
    //         await queryRunner.startTransaction();

    //         await queryRunner.manager
    //             .createQueryBuilder()
    //             .insert()
    //             .into(WaterQuality)
    //             .values(sensorArray)
    //             .execute();

    //         await queryRunner.commitTransaction();
    //     } catch (error) {
    //         await queryRunner.rollbackTransaction();
    //         console.error("bulk insert 실패:", error);
    //     } finally {
    //         await queryRunner.release();
    //     }
    // }
}