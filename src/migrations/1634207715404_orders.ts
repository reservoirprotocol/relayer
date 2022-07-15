import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("orders", {
    hash: {
      type: "text",
      notNull: true,
    },
    target: {
      type: "text",
      notNull: true,
    },
    maker: {
      type: "text",
      notNull: true,
    },
    created_at: {
      type: "int",
      notNull: true,
    },
    data: {
      type: "jsonb",
      notNull: true,
    },
  });

  pgm.createConstraint("orders", "orders_pk", {
    primaryKey: "hash",
  });
  pgm.createIndex("orders", ["target", { name: "created_at", sort: "DESC" }]);
}
