import { MigrationInterface, QueryRunner } from 'typeorm';

/*
 * Histórico das mensagens de WhatsApp. `pending` é gravada antes do envio, e
 * é por isso que existe: se o processo cair no meio, a linha fica para trás
 * e o admin pode reenviar. Ver WhatsappService.
 */
export class WhatsappMessages1786700000008 implements MigrationInterface {
  name = 'WhatsappMessages1786700000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."whatsapp_messages_status_enum" AS ENUM('pending', 'sent', 'failed', 'discarded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "whatsapp_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kind" character varying(40) NOT NULL,
        "phone" character varying(30) NOT NULL,
        "text" text NOT NULL,
        "status" "public"."whatsapp_messages_status_enum" NOT NULL DEFAULT 'pending',
        "error" text,
        "student_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_messages" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "FK_whatsapp_messages_student" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_messages_status" ON "whatsapp_messages" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "whatsapp_messages"`);
    await queryRunner.query(
      `DROP TYPE "public"."whatsapp_messages_status_enum"`,
    );
  }
}
