import { MigrationInterface, QueryRunner } from 'typeorm';

/*
 * Telefone do professor, obrigatório como o do aluno, para o aviso de
 * cadastro aprovado por WhatsApp. Professores antigos ficam com '' até o
 * admin preencher na ficha — a ficha exige o campo na próxima edição.
 */
export class TeacherPhone1786700000009 implements MigrationInterface {
  name = 'TeacherPhone1786700000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "teachers" ADD "phone" character varying(20) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "teachers" ALTER COLUMN "phone" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" ADD "teacher_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "FK_whatsapp_messages_teacher" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" DROP CONSTRAINT "FK_whatsapp_messages_teacher"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" DROP COLUMN "teacher_id"`,
    );
    await queryRunner.query(`ALTER TABLE "teachers" DROP COLUMN "phone"`);
  }
}
