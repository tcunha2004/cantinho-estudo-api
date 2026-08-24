import { MigrationInterface, QueryRunner } from 'typeorm';

/*
 * Link de cadastro com prazo. A `invite_links` apagada em
 * DropInviteLinks1786700000003 tinha `expires_at`; a `signup_links` que a
 * substituiu nasceu sem, então um link vazado valia para sempre.
 *
 * O DEFAULT existe só para as linhas que já estão lá (ganham 7 dias a partir
 * daqui) e sai em seguida: quem define o prazo de um link novo é a aplicação,
 * em hora de parede de São Paulo — ver SignupLinksService.create().
 */
export class SignupLinksExpiresAt1786700000004 implements MigrationInterface {
  name = 'SignupLinksExpiresAt1786700000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "signup_links" ADD "expires_at" TIMESTAMP NOT NULL DEFAULT now() + interval '7 days'`,
    );
    await queryRunner.query(
      `ALTER TABLE "signup_links" ALTER COLUMN "expires_at" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "signup_links" DROP COLUMN "expires_at"`,
    );
  }
}
