import { MigrationInterface, QueryRunner } from 'typeorm';

/* A listagem de aulas do admin filtra só por intervalo de data — nunca manda
 * status. Com `status` como coluna líder de idx_classes_status_scheduled_at, o
 * Postgres não tinha range scan utilizável e varria a tabela. O índice composto
 * fica: ele ainda serve às consultas que filtram por status. */
export class ClassesScheduledAtIndex1786700000006
  implements MigrationInterface
{
  name = 'ClassesScheduledAtIndex1786700000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_classes_scheduled_at" ON "classes" ("scheduled_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_classes_scheduled_at"`);
  }
}
