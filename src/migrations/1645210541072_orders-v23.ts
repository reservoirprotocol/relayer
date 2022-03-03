import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("orders_v23", {
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
      type: "timestamptz",
      notNull: true,
    },
    data: {
      type: "jsonb",
      notNull: true,
    },
  });

  pgm.createConstraint("orders_v23", "orders_v23_pk", {
    primaryKey: "hash",
  });
  pgm.createIndex("orders_v23", [{ name: "created_at", sort: "DESC" }]);
  pgm.createIndex("orders_v23", [
    "target",
    { name: "created_at", sort: "DESC" },
  ]);
  pgm.createIndex("orders_v23", ["target", "maker", "created_at"]);
}
