import { MigrationInterface, QueryRunner } from 'typeorm';

/*
 * O mesmo link de cadastro passa a servir para professor: `role` diz de quem é
 * o rascunho, e `bio`/`subject_ids` são o que só o professor preenche. As
 * colunas de aluno (região, plano, responsáveis) ficam nulas nesse caso — ver
 * SignupLinksService.ensureComplete().
 *
 * O DEFAULT em `role` existe para as linhas que já estão lá, todas de aluno, e
 * fica: é o mesmo padrão que a aplicação usa quando o admin não escolhe.
 */
export class SignupLinksTeacher1786700000005 implements MigrationInterface {
  name = 'SignupLinksTeacher1786700000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "signup_links" ADD "role" character varying NOT NULL DEFAULT 'student'`,
    );
    await queryRunner.query(`ALTER TABLE "signup_links" ADD "bio" text`);
    await queryRunner.query(
      `ALTER TABLE "signup_links" ADD "subject_ids" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "signup_links" DROP COLUMN "subject_ids"`,
    );
    await queryRunner.query(`ALTER TABLE "signup_links" DROP COLUMN "bio"`);
    await queryRunner.query(`ALTER TABLE "signup_links" DROP COLUMN "role"`);
  }
}
