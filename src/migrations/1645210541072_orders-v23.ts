import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType("source_t", ["opensea", "looksrare", "x2y2", "element"]);

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
    inserted_at: {
      type: "timestamptz",
      default: pgm.func("now()"),
    },
    source: {
      type: "source_t",
    },
    delayed: {
      type: "boolean",
    },
  });

  pgm.createConstraint("orders_v23", "orders_v23_pk", {
    primaryKey: "hash",
  });
  pgm.createIndex("orders_v23", [{ name: "created_at", sort: "DESC" }]);
  pgm.createIndex("orders_v23", ["target", { name: "created_at", sort: "DESC" }]);
  pgm.createIndex("orders_v23", ["target", "maker", "created_at"]);
}
