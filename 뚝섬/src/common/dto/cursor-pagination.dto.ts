import { IsInt, IsOptional, IsString } from "class-validator";

export class CursorPaginationDto {
    @IsString()
    @IsOptional()
    cursorId: string;

    @IsInt()
    @IsOptional()
    take: number = 10;
}