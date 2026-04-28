import { BaseTable } from "src/common/entities/base-table.entity";
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from "typeorm";
import { AIS } from "./ais.entity";

@Entity()
export class AISStatic extends BaseTable {
    @PrimaryColumn()
    mmsi: string

    @Column({
        nullable: true
    })
    imo: number

    @Column({
        nullable: true
    })
    call_sign: string

    @Column({
        nullable: true
    })
    name: string

    @Column({
        default: 0,
        nullable: true
    })
    type: number

    @Column({
        default: 0,
        nullable: true
    })
    ref_pos_a: number

    @Column({
        default: 0,
        nullable: true
    })
    ref_pos_b: number

    @Column({
        default: 0,
        nullable: true
    })
    ref_pos_c: number

    @Column({
        default: 0,
        nullable: true
    })
    ref_pos_d: number

    @Column({
        default: 0,
        nullable: true
    })
    epfd: number

    @Column({
        nullable: true
    })
    eta_month: number

    @Column({
        nullable: true
    })
    eta_day: number

    @Column({
        nullable: true
    })
    eta_hour: number

    @Column({
        nullable: true
    })
    eta_minute: number

    @Column({
        type: 'decimal',
        precision: 10,
        scale: 2,
        nullable: true
    })
    draft: number

    @Column({
        nullable: true
    })
    destination: string

    @OneToOne(() => AIS, (ais) => ais.staticInfo)
    // @JoinColumn({ name: 'mmsi' })
    ais: AIS
}

