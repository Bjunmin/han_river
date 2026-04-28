import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envVariableKeys } from './common/const/env.const';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { JwtModule } from '@nestjs/jwt'; // ✅ JWT 모듈 추가
import { User } from './user/entities/user.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheInterceptor } from './common/interceptor/cache.interceptor';
import { TransactionIntercepotr } from './common/interceptor/transaction.interceptor';
import { CacheModule } from '@nestjs/cache-manager';
import { BearerTokenMiddleware } from './auth/middleware/bearer-token.middleware';
import { AuthGuard } from './auth/guard/auth.guard';
import { UserService } from './user/user.service';
import { UserSetting } from './user/entities/user-setting.entity';
import { AisModule } from './ais/ais.module';
import { AIS } from './ais/entities/ais.entity';
import { AISHistory } from './ais/entities/ais.history.entity';
import { AISStatic } from './ais/entities/ais-static.entity';
import { AISDetection } from './ais/entities/ais.detection.entity';
import { Setting } from './setting/entities/setting.entity';
import { isAbsolute, resolve as resolvePath, dirname } from 'path';
import * as fs from 'fs';

/**
 * DB 경로를 절대경로로 확정한다.
 * - 상대경로면 cwd 기준
 * - 디렉토리가 없으면 미리 생성 (PM2 cwd 이슈 예방)
 */
function resolveDbPath(raw: string | undefined): string {
  const value = (raw ?? './data/han_river.sqlite').trim();
  const absolute = isAbsolute(value) ? value : resolvePath(process.cwd(), value);
  try {
    fs.mkdirSync(dirname(absolute), { recursive: true });
  } catch {
    // 권한 문제면 뒤에서 better-sqlite3 가 다시 터뜨려주니 패스
  }
  return absolute;
}

/**
 * 24/7 운영용 SQLite PRAGMA 세팅.
 * - WAL: 쓰기/읽기 동시성 + 크래시 복구 빠름
 * - synchronous=NORMAL: FULL 보다 10x 빠름. 전원차단 시 최근 1~2 트랜잭션 유실 (AIS 는 허용)
 * - busy_timeout: 락 경합 시 5초 재시도
 * - foreign_keys ON
 * - cache_size -64000: 64MB 메모리 캐시
 * - temp_store MEMORY
 */
function applyPragmas(db: any) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');
  db.pragma('foreign_keys = ON');
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: resolveDbPath(configService.get<string>(envVariableKeys.dbPath)),
        entities: [
          User,
          UserSetting,
          AIS,
          AISHistory,
          AISStatic,
          AISDetection,
          Setting,
        ],
        synchronize: true,
        // better-sqlite3 전용: DB 핸들 생성 직후 PRAGMA 세팅
        prepareDatabase: (db: any) => {
          applyPragmas(db);
        },
      }),
      inject: [ConfigService]
    }),

    CacheModule.register({
      ttl: 10000, // ms
      isGlobal: true,
    }),
    JwtModule,
    CommonModule,
    UserModule,
    AuthModule,
    ScheduleModule.forRoot(),
    AisModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: CacheInterceptor
    // },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: TransactionIntercepotr
    // },
    {
      provide: APP_GUARD,
      useClass: AuthGuard
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // consumer.apply(
    //   BearerTokenMiddleware,
    // ).exclude(
    //   {
    //     path: 'auth/login',
    //     method: RequestMethod.POST,
    //   },
    //   {
    //     path: 'auth/register',
    //     method: RequestMethod.POST,
    //   },
    // ).forRoutes('*')
  }
}
