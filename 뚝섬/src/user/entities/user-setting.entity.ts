import { BaseTable } from "src/common/entities/base-table.entity";
import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "./user.entity"

@Entity()
export class UserSetting extends BaseTable {
    @PrimaryGeneratedColumn()
    id: number

    @OneToOne(
        () => User,
        user => user.setting
    )
    @JoinColumn()
    user: User

    @Column()
    nickname: string

    @Column({
        nullable: true
    })
    companyName: string

    @Column({
        default: 60
    })
    interval: number

    @Column({
        default: true
    })
    sharedData: boolean

    @Column({
        default: true
    })
    viewAds: boolean

    @Column({
        default: 'korean'
    })
    language: string
}