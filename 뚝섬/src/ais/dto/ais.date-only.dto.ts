import { IsNotEmpty, IsDateString } from 'class-validator';

export class DateOnlyDto {
    @IsDateString()
    @IsNotEmpty()
    startDate: string;  // ISO8601 권장: '2024-06-20T00:00:00'

    @IsDateString()
    @IsNotEmpty()
    endDate: string;
}

