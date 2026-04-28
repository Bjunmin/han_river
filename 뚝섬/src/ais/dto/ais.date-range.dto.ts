import { IsNotEmpty, IsDateString, IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class DateRangeDto {
    @IsString()
    @IsNotEmpty()
    mmsi: string

    @IsDateString()
    @IsNotEmpty()
    startDate: string;  // ISO8601 권장: '2024-06-20T00:00:00'

    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    cursorId?: number;  // 이전 페이지의 마지막 id (첫 페이지는 생략)

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    take?: number;      // 한 페이지당 개수 (기본 100, 최대 500)
}