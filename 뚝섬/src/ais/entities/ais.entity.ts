import { BaseTable } from "src/common/entities/base-table.entity";
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from "typeorm";
import { AISStatic } from "./ais-static.entity";

@Entity()
export class AIS extends BaseTable {

    @PrimaryColumn()
    mmsi: string

    @Column({
        nullable: true
    })
    name: string

    @Column({
        type: 'decimal',
        precision: 10,
        scale: 6,
        nullable: true
    })
    lat: number

    @Column({
        type: 'decimal',
        precision: 10,
        scale: 6,
        nullable: true
    })
    lon: number

    @Column({
        default: 0,
        nullable: true
    })
    sog: number


    @Column({
        type: 'decimal',
        precision: 12,
        scale: 2,
        nullable: true
    })
    distance: number

    @Column({
        type: 'decimal',
        precision: 5,
        scale: 2,
        nullable: true
    })
    cog: number

    @Column({
        type: 'decimal',
        precision: 5,
        scale: 2,
        nullable: true
    })
    hdg: number

    @Column({
        type: 'varchar',
        length: 10,
        nullable: true
    })
    nav_status: string

    @Column({
        type: 'int',
        nullable: true
    })
    rot: number

    @Column({
        type: 'int',
        default: 0,
        comment: '0: delete API 미전송, 1: delete API 전송 완료, 2: delete API 전송 실패 (타임아웃/먹통)'
    })
    deleteSent: number

    // ---- 분산 수신 메타 (여의도/뚝섬 2곳에서 동시 수신 추적) ----
    @Column({
        type: 'varchar',
        length: 32,
        nullable: true,
        comment: '가장 최근 데이터를 보낸 엣지 이름 (예: 여의도, 뚝섬)'
    })
    lastSource: string

    @Column({
        type: 'text',
        nullable: true,
        comment: '최근 5분 이내 수신 소스 집합 JSON. 예: ["여의도","뚝섬"]'
    })
    activeSources: string

    @Column({
        type: 'bigint',
        nullable: true,
        comment: '마지막 수신 시각 (epoch ms). stale 판정용'
    })
    lastReceivedAt: number

    @OneToOne(() => AISStatic, (aisStatic) => aisStatic.ais, { nullable: true })
    @JoinColumn()
    staticInfo: AISStatic
}
