import { MigrationInterface, QueryRunner } from "typeorm";

export class RevenueFreezeAndIndexes1782924851433 implements MigrationInterface {
    name = 'RevenueFreezeAndIndexes1782924851433'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" ADD "amount" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "classes" ADD "amount_charged" numeric(10,2)`);
        await queryRunner.query(`CREATE INDEX "idx_classes_teacher_id" ON "classes"  ("teacher_id") `);
        await queryRunner.query(`CREATE INDEX "idx_classes_status_scheduled_at" ON "classes"  ("status", "scheduled_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_classes_status_scheduled_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_classes_teacher_id"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN "amount_charged"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "amount"`);
    }

}
