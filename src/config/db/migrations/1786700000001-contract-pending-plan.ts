import { MigrationInterface, QueryRunner } from 'typeorm';

/* Troca de plano pendente: quando o contrato tem parcela em aberto, a troca
 * fica registrada aqui em vez de ser aplicada na hora. Ver
 * StudentContractsService.schedulePlanChange(). */
export class ContractPendingPlan1786700000001 implements MigrationInterface {
  name = 'ContractPendingPlan1786700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "student_contracts" ADD "pending_plan_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_contracts" ADD "pending_discount_percentage" numeric(5,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_contracts" ADD CONSTRAINT "FK_student_contracts_pending_plan" FOREIGN KEY ("pending_plan_id") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "student_contracts" DROP CONSTRAINT "FK_student_contracts_pending_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_contracts" DROP COLUMN "pending_discount_percentage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_contracts" DROP COLUMN "pending_plan_id"`,
    );
  }
}
