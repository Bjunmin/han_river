import { Exclude } from "class-transformer";
import { BaseTable } from "src/common/entities/base-table.entity";
import { Column, Entity, OneToMany, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { ExclusionMetadata } from "typeorm/metadata/ExclusionMetadata";
import { UserSetting } from "./user-setting.entity";

export enum Role {
    admin = "admin",
    paidUser = "paidUser",
    user = "user",
    nonMember = "nonMember"
}

@Entity()
export class User extends BaseTable {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    name: string

    @Column({
        unique: true
    })
    phoneNumber: string

    @Column()
    @Exclude({
        toPlainOnly: true
    })
    password: string

    @Column({
        type: 'varchar',
        default: Role.user
    })
    role: Role

    @Column({
        default: true
    })
    agree: boolean


    @OneToOne(
        () => UserSetting,
        setting => setting.user
    )
    setting: UserSetting

}
