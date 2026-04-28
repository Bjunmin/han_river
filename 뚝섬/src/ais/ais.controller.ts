import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { AisService } from './ais.service';
import { IngestGateway } from './ingest.gateway';
import { DateRangeDto } from './dto/ais.date-range.dto';
import { DateOnlyDto } from './dto/ais.date-only.dto';

@Controller('ais')
export class AisController {
  constructor(
    private readonly aisService: AisService,
    private readonly ingestGateway: IngestGateway,
  ) { }

  @Get()
  async findAll() {
    return this.aisService.findAll()
  }

  /**
   * 24/7 모니터링용 헬스 엔드포인트.
   * - 모드/사이트/시리얼 포트/TCP/중앙 클라이언트/수집 게이트웨이/활성 MMSI 현황을 한 번에 리턴
   * - 인증 없이 접근 가능 (AuthGuard 는 현재 bypass 상태이므로 Public 데코레이터 불필요)
   */
  @Get('health')
  getHealth() {
    return {
      ...this.aisService.getHealthSnapshot(),
      ingest: this.ingestGateway.snapshot(),
      uptimeSec: Math.round(process.uptime()),
      memory: process.memoryUsage(),
    };
  }

  @Get('date')
  async getAisHistory(@Query() query: DateRangeDto) {
    const startDate = new Date(query.startDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(query.endDate);
    endDate.setHours(23, 59, 59, 999);

    const take = query.take ? Math.min(Number(query.take), 500) : 100;
    const cursorId = query.cursorId ? Number(query.cursorId) : undefined;

    return this.aisService.findAISHistoryByDateRange(
      query.mmsi,
      startDate,
      endDate,
      cursorId,
      take,
    );
  }

  @Get('list-by-date')
  async getAISListByDate(@Query() query: DateOnlyDto): Promise<Array<{ mmsi: string; name: string }>> {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    // 날짜만 받으므로 하루의 시작(00:00:00)과 끝(23:59:59)으로 설정
    const startDate = new Date(query.startDate);
    startDate.setHours(0, 0, 0, 0); // 시작일 00:00:00

    const endDate = new Date(query.endDate);
    endDate.setHours(23, 59, 59, 999); // 종료일 23:59:59

    // 한국 시간 보정
    const KOREA_TIME_OFFSET = 9 * 60 * 60 * 1000;
    const koreaStartDate = new Date(startDate.getTime());
    const koreaEndDate = new Date(endDate.getTime());

    return this.aisService.findAISListByDateRange(koreaStartDate, koreaEndDate);
  }

}
