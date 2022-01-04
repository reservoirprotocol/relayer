import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("orders", {
    hash: {
      type: "TEXT",
      notNull: true,
    },
    target: {
      type: "TEXT",
      notNull: true,
    },
    maker: {
      type: "TEXT",
      notNull: true,
    },
    created_at: {
      type: "INT",
      notNull: true,
    },
    data: {
      type: "JSONB",
      notNull: true,
    },
  });

  pgm.createConstraint("orders", "orders_pk", {
    primaryKey: "hash",
  });
  pgm.createIndex("orders", ["target", { name: "created_at", sort: "DESC" }]);
}
