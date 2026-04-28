import { BaseTable } from "src/common/entities/base-table.entity";
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class AISDetection extends BaseTable {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    mmsi: string

    @Column()
    targetID: string
}
