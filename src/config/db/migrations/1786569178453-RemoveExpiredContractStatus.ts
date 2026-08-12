import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveExpiredContractStatus1786569178453 implements MigrationInterface {
    name = 'RemoveExpiredContractStatus1786569178453'

    public async up(queryRunner: QueryRunner): Promise<void> {
        /* Contratos "vencidos" deixam de existir como status: passam a cancelados */
        await queryRunner.query(`UPDATE "student_contracts" SET "status" = 'cancelled' WHERE "status" = 'expired'`);
        await queryRunner.query(`ALTER TYPE "public"."student_contracts_status_enum" RENAME TO "student_contracts_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."student_contracts_status_enum" AS ENUM('active', 'cancelled')`);
        await queryRunner.query(`ALTER TABLE "student_contracts" ALTER COLUMN "status" TYPE "public"."student_contracts_status_enum" USING "status"::"text"::"public"."student_contracts_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."student_contracts_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."student_contracts_status_enum_old" AS ENUM('active', 'cancelled', 'expired')`);
        await queryRunner.query(`ALTER TABLE "student_contracts" ALTER COLUMN "status" TYPE "public"."student_contracts_status_enum_old" USING "status"::"text"::"public"."student_contracts_status_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."student_contracts_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."student_contracts_status_enum_old" RENAME TO "student_contracts_status_enum"`);
    }

}
