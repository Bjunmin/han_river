import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class AISDataDto {
    @IsNotEmpty()
    @IsString()
    mmsi: string

    @IsOptional()
    @IsString()
    name: string

    @IsNotEmpty()
    @IsNumber()
    lat: number

    @IsNotEmpty()
    @IsNumber()
    lon: number

    @IsNotEmpty()
    @IsNumber()
    distance: number

    @IsNotEmpty()
    @IsNumber()
    sog: number

}
