import type { DuckDBInstance } from "@duckdb/node-api";

export type InstanceOpenedListener = (databasePath: string, instance: DuckDBInstance) => void;
