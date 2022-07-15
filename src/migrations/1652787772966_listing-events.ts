import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("listing_events", {
    maker: {
      type: "text",
      notNull: true,
    },
    contract: {
      type: "text",
      notNull: true,
    },
    token_id: {
      type: "numeric",
      notNull: true,
    },
    price: {
      type: "numeric",
      notNull: true,
    },
    listing_time: {
      type: "int",
      notNull: true,
    },
    event_date: {
      type: "timestamptz",
      notNull: true,
    },
    created_date: {
      type: "timestamptz",
      default: pgm.func("now()"),
    },
  });

  pgm.createConstraint("listing_events", "listing_events_pk", {
    primaryKey: ["maker", "contract", "token_id", "listing_time"],
  });
  pgm.addIndex("listing_events", ["contract", "token_id"]);
}
