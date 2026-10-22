import { MigrationInterface, QueryRunner } from 'typeorm';

/* Uma linha só: guarda o token da instância da UAZAPI criada pelo próprio sistema. */
export class WhatsappInstance1786700000007 implements MigrationInterface {
  name = 'WhatsappInstance1786700000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "whatsapp_instance" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token" character varying(255) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_instance" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "whatsapp_instance"`);
  }
}
