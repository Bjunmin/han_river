import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateAISDto {
    @IsNotEmpty()
    @IsString()
    mmsi: string

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
