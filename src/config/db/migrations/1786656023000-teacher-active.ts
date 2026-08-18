import { MigrationInterface, QueryRunner } from 'typeorm';

export class TeacherActive1786656023000 implements MigrationInterface {
  name = 'TeacherActive1786656023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "teachers" ADD "active" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" DROP COLUMN "active"`);
  }
}
