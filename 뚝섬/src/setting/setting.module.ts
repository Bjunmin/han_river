import { Module, forwardRef } from '@nestjs/common';
import { SettingService } from './setting.service';
import { SettingController } from './setting.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from './entities/setting.entity';
import { CacheModule } from '@nestjs/cache-manager';
import { AisModule } from 'src/ais/ais.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Setting
        ]),
        CacheModule.register(),
        forwardRef(() => AisModule)
    ],
    controllers: [SettingController],
    providers: [SettingService],
    exports: [SettingService],
})
export class SettingModule { }

