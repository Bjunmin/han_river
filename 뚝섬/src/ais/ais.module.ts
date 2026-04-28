import { Module } from '@nestjs/common';
import { AisService } from './ais.service';
import { AisController } from './ais.controller';
import { AisGateway } from './ais.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIS } from './entities/ais.entity';
import { AISHistory } from './entities/ais.history.entity';
import { AISStatic } from './entities/ais-static.entity';
import { AISDetection } from './entities/ais.detection.entity';
import { SettingModule } from 'src/setting/setting.module';
import { Setting } from 'src/setting/entities/setting.entity';
import { CentralClientService } from './central-client.service';
import { IngestGateway } from './ingest.gateway';

@Module({
  imports: [
    SettingModule,
    TypeOrmModule.forFeature(
      [
        AIS,
        AISHistory,
        AISStatic,
        AISDetection,
        Setting
      ]
    )
  ],
  controllers: [AisController],
  providers: [AisService, AisGateway, CentralClientService, IngestGateway],
  exports: [AisService, CentralClientService],
})
export class AisModule { }
