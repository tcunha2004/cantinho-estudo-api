import { MigrationInterface, QueryRunner } from 'typeorm';

/*
 * `invite_links` nasceu na migration base e nunca teve módulo, service nem
 * rota — código morto que fazia par com o `signup_links` de verdade. Sai para
 * não existirem dois caminhos de convite, sendo que só um funciona.
 */
export class DropInviteLinks1786700000003 implements MigrationInterface {
  name = 'DropInviteLinks1786700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invite_links"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."invite_links_target_role_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."invite_links_target_role_enum" AS ENUM('professor', 'student')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invite_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token" character varying NOT NULL, "target_role" "public"."invite_links_target_role_enum" NOT NULL, "discount_percentage" numeric(5,2), "expires_at" TIMESTAMP NOT NULL, "used" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid NOT NULL, CONSTRAINT "UQ_f1c74b159627ace408af32c879e" UNIQUE ("token"), CONSTRAINT "PK_df46bd981abebf8f78c5e334705" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "invite_links" ADD CONSTRAINT "FK_97b4df4290f72ec3d7b8e55c948" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
