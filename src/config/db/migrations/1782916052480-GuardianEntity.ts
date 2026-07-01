import { MigrationInterface, QueryRunner } from "typeorm";

export class GuardianEntity1782916052480 implements MigrationInterface {
    name = 'GuardianEntity1782916052480'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "guardians" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(80) NOT NULL, "phone" character varying(20) NOT NULL, "cpf" character varying(14) NOT NULL, "rg" character varying(20), "is_financial_responsible" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "student_id" uuid NOT NULL, CONSTRAINT "PK_3dcf02f3dc96a2c017106f280be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "guardians" ADD CONSTRAINT "FK_69e793368dac6279adfd6ca55ad" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "guardians" DROP CONSTRAINT "FK_69e793368dac6279adfd6ca55ad"`);
        await queryRunner.query(`DROP TABLE "guardians"`);
    }

}
