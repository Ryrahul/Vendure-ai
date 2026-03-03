import {MigrationInterface, QueryRunner} from "typeorm";

export class Cahce1772520052292 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "cache_item" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "insertedAt" TIMESTAMP(3) NOT NULL, "key" character varying NOT NULL, "value" text NOT NULL, "expiresAt" TIMESTAMP(3), "id" SERIAL NOT NULL, CONSTRAINT "UQ_1ada355aa01694ed45f7ed0fba8" UNIQUE ("key"), CONSTRAINT "PK_36ada2d984757e4a4a1bf672415" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "cache_item_key" ON "cache_item" ("key") `, undefined);
        await queryRunner.query(`CREATE TABLE "cache_tag" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tag" character varying NOT NULL, "id" SERIAL NOT NULL, "itemId" integer NOT NULL, CONSTRAINT "UQ_99cfdf5b111a6589a5c5ab1e0c7" UNIQUE ("tag", "itemId"), CONSTRAINT "PK_992ec92255266beaebbf3ea250b" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "cache_tag_tag" ON "cache_tag" ("tag") `, undefined);
        await queryRunner.query(`ALTER TABLE "cache_tag" ADD CONSTRAINT "FK_16516b25ba15db4e95261bb0bfe" FOREIGN KEY ("itemId") REFERENCES "cache_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "cache_tag" DROP CONSTRAINT "FK_16516b25ba15db4e95261bb0bfe"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."cache_tag_tag"`, undefined);
        await queryRunner.query(`DROP TABLE "cache_tag"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."cache_item_key"`, undefined);
        await queryRunner.query(`DROP TABLE "cache_item"`, undefined);
   }

}
