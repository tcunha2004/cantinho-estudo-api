import { MigrationInterface, QueryRunner } from 'typeorm';

/* Remove o status "overdue" de parcelas — o sistema não gera mais parcela
 * vencida, só pending/paid/cancelled. Postgres não permite remover valor de
 * enum diretamente, então troca o tipo por um novo sem "overdue". */
export class PaymentStatusDropOverdue1786700000000 implements MigrationInterface {
  name = 'PaymentStatusDropOverdue1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "payments" SET "status" = 'pending' WHERE "status" = 'overdue'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum_new" AS ENUM('pending', 'paid', 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum_new" USING "status"::text::"public"."payments_status_enum_new"`,
    );
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."payments_status_enum_new" RENAME TO "payments_status_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum_old" AS ENUM('pending', 'paid', 'overdue', 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum_old" USING "status"::text::"public"."payments_status_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."payments_status_enum_old" RENAME TO "payments_status_enum"`,
    );
  }
}
