import { MigrationInterface, QueryRunner } from "typeorm";

export class Base1786642832287 implements MigrationInterface {
    name = 'Base1786642832287'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(80) NOT NULL, "email" character varying(150) NOT NULL, "password" character varying(80) NOT NULL, "role" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."plans_plan_type_enum" AS ENUM('ouro', 'prata', 'bronze', 'avulsa')`);
        await queryRunner.query(`CREATE TYPE "public"."plans_frequency_enum" AS ENUM('2', '3', '5')`);
        await queryRunner.query(`CREATE TABLE "plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "plan_type" "public"."plans_plan_type_enum" NOT NULL, "frequency" "public"."plans_frequency_enum", "monthly_price" numeric(10,2) NOT NULL, "hour_price" numeric(10,2) NOT NULL, "classes_count" integer, "validity_months" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "region_id" uuid NOT NULL, CONSTRAINT "uq_plan" UNIQUE ("region_id", "plan_type", "frequency"), CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "regions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "slug" character varying(120) NOT NULL, "enrollment_fee" numeric(10,2) NOT NULL, "class_commission" numeric(10,2) NOT NULL, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_53cf784f23cbf14bb7717e969d4" UNIQUE ("slug"), CONSTRAINT "PK_4fcd12ed6a046276e2deb08801c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "guardians" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(80) NOT NULL, "phone" character varying(20) NOT NULL, "cpf" character varying(14) NOT NULL, "rg" character varying(20), "is_financial_responsible" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "student_id" uuid NOT NULL, CONSTRAINT "PK_3dcf02f3dc96a2c017106f280be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "students" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phone" character varying(20) NOT NULL, "address" text, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "user_id" uuid NOT NULL, "region_id" uuid NOT NULL, CONSTRAINT "REL_fb3eff90b11bddf7285f9b4e28" UNIQUE ("user_id"), CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'paid', 'overdue', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" numeric(10,2) NOT NULL, "due_date" date NOT NULL, "paid_at" TIMESTAMP, "status" "public"."payments_status_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "student_contract_id" uuid NOT NULL, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."student_contracts_status_enum" AS ENUM('active', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "student_contracts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "start_date" date NOT NULL, "end_date" date, "discount_percentage" numeric(5,2), "status" "public"."student_contracts_status_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "student_id" uuid NOT NULL, "plan_id" uuid NOT NULL, CONSTRAINT "PK_24c42ca40f5045d50172290d86a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "subjects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1a023685ac2b051b4e557b0b280" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "teachers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "bio" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, CONSTRAINT "REL_4668d4752e6766682d1be0b346" UNIQUE ("user_id"), CONSTRAINT "PK_a8d4f83be3abe4c687b0a0093c8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."classes_location_type_enum" AS ENUM('home', 'school')`);
        await queryRunner.query(`CREATE TYPE "public"."classes_status_enum" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show')`);
        await queryRunner.query(`CREATE TABLE "classes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scheduled_at" TIMESTAMP NOT NULL, "duration_minutes" integer NOT NULL DEFAULT '60', "location_type" "public"."classes_location_type_enum" NOT NULL, "status" "public"."classes_status_enum" NOT NULL, "commission_amount" numeric(10,2), "amount_charged" numeric(10,2), "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "student_contract_id" uuid NOT NULL, "teacher_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "region_id" uuid, CONSTRAINT "PK_e207aa15404e9b2ce35910f9f7f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_classes_teacher_id" ON "classes"  ("teacher_id") `);
        await queryRunner.query(`CREATE INDEX "idx_classes_status_scheduled_at" ON "classes"  ("status", "scheduled_at") `);
        await queryRunner.query(`CREATE TYPE "public"."invite_links_target_role_enum" AS ENUM('professor', 'student')`);
        await queryRunner.query(`CREATE TABLE "invite_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token" character varying NOT NULL, "target_role" "public"."invite_links_target_role_enum" NOT NULL, "discount_percentage" numeric(5,2), "expires_at" TIMESTAMP NOT NULL, "used" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid NOT NULL, CONSTRAINT "UQ_f1c74b159627ace408af32c879e" UNIQUE ("token"), CONSTRAINT "PK_df46bd981abebf8f78c5e334705" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "teacher_subjects" ("teacher_id" uuid NOT NULL, "subject_id" uuid NOT NULL, CONSTRAINT "PK_9e05964fe6f2598b643470c2067" PRIMARY KEY ("teacher_id", "subject_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6675136306b9111126bbdbbaba" ON "teacher_subjects"  ("teacher_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f35ef96bfb3a84b712722d6db7" ON "teacher_subjects"  ("subject_id") `);
        await queryRunner.query(`ALTER TABLE "plans" ADD CONSTRAINT "FK_4af50d60499cf33072eb5fe9d99" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "guardians" ADD CONSTRAINT "FK_69e793368dac6279adfd6ca55ad" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "students" ADD CONSTRAINT "FK_fb3eff90b11bddf7285f9b4e281" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "students" ADD CONSTRAINT "FK_67785d5bc9d7271bc8bc7e87010" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_c683cfb15f713a7ed5c78664e8f" FOREIGN KEY ("student_contract_id") REFERENCES "student_contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "student_contracts" ADD CONSTRAINT "FK_e36c990d9509fa6e2f312a3b484" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "student_contracts" ADD CONSTRAINT "FK_2b4e8e225e0bf399e7fd0707074" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "teachers" ADD CONSTRAINT "FK_4668d4752e6766682d1be0b346f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "classes" ADD CONSTRAINT "FK_ee3a78b9a5a4d915dd4099e0198" FOREIGN KEY ("student_contract_id") REFERENCES "student_contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "classes" ADD CONSTRAINT "FK_b34c92e413c4debb6e0f23fed46" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "classes" ADD CONSTRAINT "FK_a72581b1b6a0ddf0bf5e8bebfc4" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "classes" ADD CONSTRAINT "FK_c9ef77e9dceba67a86904bcfedf" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invite_links" ADD CONSTRAINT "FK_97b4df4290f72ec3d7b8e55c948" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "teacher_subjects" ADD CONSTRAINT "FK_6675136306b9111126bbdbbaba7" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "teacher_subjects" ADD CONSTRAINT "FK_f35ef96bfb3a84b712722d6db70" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "teacher_subjects" DROP CONSTRAINT "FK_f35ef96bfb3a84b712722d6db70"`);
        await queryRunner.query(`ALTER TABLE "teacher_subjects" DROP CONSTRAINT "FK_6675136306b9111126bbdbbaba7"`);
        await queryRunner.query(`ALTER TABLE "invite_links" DROP CONSTRAINT "FK_97b4df4290f72ec3d7b8e55c948"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_c9ef77e9dceba67a86904bcfedf"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_a72581b1b6a0ddf0bf5e8bebfc4"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_b34c92e413c4debb6e0f23fed46"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_ee3a78b9a5a4d915dd4099e0198"`);
        await queryRunner.query(`ALTER TABLE "teachers" DROP CONSTRAINT "FK_4668d4752e6766682d1be0b346f"`);
        await queryRunner.query(`ALTER TABLE "student_contracts" DROP CONSTRAINT "FK_2b4e8e225e0bf399e7fd0707074"`);
        await queryRunner.query(`ALTER TABLE "student_contracts" DROP CONSTRAINT "FK_e36c990d9509fa6e2f312a3b484"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_c683cfb15f713a7ed5c78664e8f"`);
        await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "FK_67785d5bc9d7271bc8bc7e87010"`);
        await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "FK_fb3eff90b11bddf7285f9b4e281"`);
        await queryRunner.query(`ALTER TABLE "guardians" DROP CONSTRAINT "FK_69e793368dac6279adfd6ca55ad"`);
        await queryRunner.query(`ALTER TABLE "plans" DROP CONSTRAINT "FK_4af50d60499cf33072eb5fe9d99"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f35ef96bfb3a84b712722d6db7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6675136306b9111126bbdbbaba"`);
        await queryRunner.query(`DROP TABLE "teacher_subjects"`);
        await queryRunner.query(`DROP TABLE "invite_links"`);
        await queryRunner.query(`DROP TYPE "public"."invite_links_target_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_classes_status_scheduled_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_classes_teacher_id"`);
        await queryRunner.query(`DROP TABLE "classes"`);
        await queryRunner.query(`DROP TYPE "public"."classes_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."classes_location_type_enum"`);
        await queryRunner.query(`DROP TABLE "teachers"`);
        await queryRunner.query(`DROP TABLE "subjects"`);
        await queryRunner.query(`DROP TABLE "student_contracts"`);
        await queryRunner.query(`DROP TYPE "public"."student_contracts_status_enum"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TABLE "students"`);
        await queryRunner.query(`DROP TABLE "guardians"`);
        await queryRunner.query(`DROP TABLE "regions"`);
        await queryRunner.query(`DROP TABLE "plans"`);
        await queryRunner.query(`DROP TYPE "public"."plans_frequency_enum"`);
        await queryRunner.query(`DROP TYPE "public"."plans_plan_type_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
