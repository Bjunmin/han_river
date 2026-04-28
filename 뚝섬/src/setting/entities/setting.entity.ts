import { BaseTable } from "src/common/entities/base-table.entity";
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Setting extends BaseTable {
    @PrimaryGeneratedColumn()
    id: number

    @Column({
        type: 'varchar',
        length: 255,
        nullable: true,
        default: '118.40.116.129'
    })
    externalApiIp: string

    @Column({
        type: 'int',
        nullable: true,
        default: 24010
    })
    externalApiPort: number

    @Column({
        type: 'int',
        nullable: true,
        default: 0
    })
    aisCommunicationType: number // 0: serial, 1: tcp

    @Column({
        type: 'varchar',
        length: 255,
        nullable: true,
        default: null
    })
    aisSerialPort: string

    @Column({
        type: 'text',
        nullable: true,
        default: null
    })
    aisSerialPorts: string // JSON 배열: '["/dev/tty.usb1", "/dev/tty.usb2"]'

    @Column({
        type: 'varchar',
        length: 255,
        nullable: true,
        default: '127.0.0.1'
    })
    aisTcpIp: string

    @Column({
        type: 'int',
        nullable: true,
        default: 4001
    })
    aisTcpPort: number

    @Column({
        type: 'real',
        nullable: true,
        default: 35.1358
    })
    aisLatitude: number

    @Column({
        type: 'real',
        nullable: true,
        default: 129.07
    })
    aisLongitude: number

    @Column({
        type: 'real',
        nullable: true,
        default: 0
    })
    aisHeading: number

    // ---- 분산 수신 엣지 목록 (여의도/뚝섬 좌표를 UI 에 표시) ----
    // JSON 배열: [{"name":"여의도","lat":37.52,"lon":126.93},{"name":"뚝섬","lat":37.53,"lon":127.07}]
    @Column({
        type: 'text',
        nullable: true,
        default: null,
        comment: 'JSON: 엣지(AIS 수신기) 목록 [{name, lat, lon}]'
    })
    edges: string
}

