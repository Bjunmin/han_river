import { BaseTable } from "src/common/entities/base-table.entity";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export class ais {
    mmsi: string;
    lat: number;
    lon: number;
    sog: number
}

@Entity()
@Index('idx_ais_history_mmsi_created', ['mmsi', 'createdAt'])
@Index('idx_ais_history_created', ['createdAt'])
export class AISHistory extends BaseTable {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    mmsi: string

    @Column({
        type: 'varchar',
        length: 32,
        nullable: true,
        comment: '이 기록을 수신한 엣지 이름 (예: 여의도, 뚝섬)'
    })
    source: string

    @Column({
        type: 'decimal',
        precision: 10,
        scale: 6,
    })
    lat: number;

    @Column({
        type: 'decimal',
        precision: 10,
        scale: 6,
    })
    lon: number;

    @Column({
        type: 'varchar',
        length: 10,
        nullable: true,
        comment: '항해 상태'
    })
    nav_status: string;

    @Column({
        type: 'decimal',
        precision: 8,
        scale: 2,
        nullable: true,
        comment: '선박 회전율 (Rate of Turn)'
    })
    rot: number;

    @Column({
        type: 'decimal',
        precision: 8,
        scale: 2,
        nullable: true,
        comment: '대지 추적 각도 (Course Over Ground)'
    })
    cog: number;

    @Column({
        type: 'decimal',
        precision: 8,
        scale: 2,
        nullable: true,
        comment: '선수 방향 (Heading)'
    })
    hdg: number;

    @Column({
        type: 'decimal',
        precision: 8,
        scale: 2,
        nullable: true,
        comment: '대지 속도 (Speed Over Ground)'
    })
    sog: number;

    @Column({
        type: 'tinyint',
        default: 0,
        comment: '동적 데이터 전송 여부 (0: 미전송/실패, 1: 성공)'
    })
    dynamicSent: number;
}
