import { MigrationInterface, QueryRunner } from 'typeorm';

/*
 * Rascunho do cadastro de um aluno novo: o admin gera o link, o aluno preenche
 * por fases e o admin aprova. Tudo nulo porque a linha nasce vazia — a
 * obrigatoriedade é cobrada no envio, não no banco. Ver SignupLinksService.
 */
export class SignupLinks1786700000002 implements MigrationInterface {
  name = 'SignupLinks1786700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."signup_links_status_enum" AS ENUM('pending', 'waiting', 'approved')`,
    );
    await queryRunner.query(
      `CREATE TABLE "signup_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "status" "public"."signup_links_status_enum" NOT NULL DEFAULT 'pending',
        "created_by" uuid NOT NULL,
        "student_name" character varying(80),
        "student_email" character varying(150),
        "student_phone" character varying(20),
        "student_address" text,
        "password" character varying(80),
        "region_id" uuid,
        "plan_id" uuid,
        "guardians" jsonb,
        "student_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "submitted_at" TIMESTAMP,
        "approved_at" TIMESTAMP,
        CONSTRAINT "PK_signup_links" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "signup_links" ADD CONSTRAINT "FK_signup_links_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "signup_links" ADD CONSTRAINT "FK_signup_links_region" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "signup_links" ADD CONSTRAINT "FK_signup_links_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "signup_links" ADD CONSTRAINT "FK_signup_links_student" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "signup_links"`);
    await queryRunner.query(`DROP TYPE "public"."signup_links_status_enum"`);
  }
}
