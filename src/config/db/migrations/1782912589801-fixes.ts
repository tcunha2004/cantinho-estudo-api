import { MigrationInterface, QueryRunner } from "typeorm";

export class Fixes1782912589801 implements MigrationInterface {
    name = 'Fixes1782912589801'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "regions" ADD "class_commission" numeric(10,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "students" ADD "active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "students" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "classes" ADD "commission_amount" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "classes" ADD "region_id" uuid`);
        await queryRunner.query(`ALTER TABLE "classes" ADD CONSTRAINT "FK_c9ef77e9dceba67a86904bcfedf" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_c9ef77e9dceba67a86904bcfedf"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN "region_id"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN "commission_amount"`);
        await queryRunner.query(`ALTER TABLE "students" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "students" DROP COLUMN "active"`);
        await queryRunner.query(`ALTER TABLE "regions" DROP COLUMN "class_commission"`);
    }

}
