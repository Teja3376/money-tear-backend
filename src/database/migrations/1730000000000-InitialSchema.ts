import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1730000000000 implements MigrationInterface {
  name = 'InitialSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL,
        "phone" text,
        "email" text,
        "first_name" text,
        "last_name" text,
        "date_of_birth" date,
        "role" text NOT NULL DEFAULT 'user',
        "status" text NOT NULL DEFAULT 'active',
        "onboarding_completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_users_role" CHECK ("role" IN ('user')),
        CONSTRAINT "CHK_users_status" CHECK ("status" IN ('active', 'suspended', 'disabled')),
        CONSTRAINT "FK_users_auth_user" FOREIGN KEY ("id")
          REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_users_phone" ON "users" ("phone")`);
    await queryRunner.query(`CREATE INDEX "idx_users_status" ON "users" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "user_security" (
        "user_id" uuid NOT NULL,
        "pin_hash" text,
        "pin_set_at" TIMESTAMP WITH TIME ZONE,
        "failed_pin_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" TIMESTAMP WITH TIME ZONE,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_security_user_id" PRIMARY KEY ("user_id"),
        CONSTRAINT "CHK_user_security_failed_attempts" CHECK ("failed_pin_attempts" >= 0),
        CONSTRAINT "FK_user_security_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_audit_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "event_type" text NOT NULL,
        "success" boolean NOT NULL,
        "ip_address" inet,
        "user_agent" text,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_audit_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_auth_audit_events_event_type" CHECK ("event_type" IN (
          'bootstrap.completed',
          'logout.requested',
          'profile.updated',
          'pin.setup.succeeded',
          'pin.setup.failed',
          'pin.setup.rejected',
          'pin.verify.succeeded',
          'pin.verify.failed',
          'pin.verify.locked',
          'pin.change.succeeded',
          'pin.change.failed',
          'pin.reset.succeeded',
          'pin.reset.failed',
          'token.rejected',
          'account.status_blocked'
        ))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_auth_audit_events_user_created" ON "auth_audit_events" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_audit_events_type_created" ON "auth_audit_events" ("event_type", "created_at")`,
    );
    // Audit history outlives the account it describes.
    await queryRunner.query(
      `ALTER TABLE "auth_audit_events" ADD CONSTRAINT "FK_auth_audit_events_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );

    // Defence in depth: application tables are never reachable through PostgREST.
    await queryRunner.query(`ALTER TABLE "users" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "user_security" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "auth_audit_events" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `REVOKE ALL ON TABLE "users", "user_security", "auth_audit_events" FROM "anon", "authenticated"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_audit_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_security"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
