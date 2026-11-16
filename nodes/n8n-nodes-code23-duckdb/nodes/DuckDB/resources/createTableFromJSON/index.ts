import type { INodeProperties } from "n8n-workflow";
import { createTableFromJSON as createTableFromJSONFunction } from "./execute";

export const createTableFromJSONDescription: INodeProperties[] = [
  {
    displayName: "Table Name",
    name: "tableName",
    type: "string",
    default: "",
    required: true,
    description: "Name of the table to create",
    placeholder: "my_table",
  },
  {
    displayName: "JSON String",
    name: "jsonString",
    type: "json",
    default: "",
    required: true,
    description: "JSON string to import into DuckDB",
    placeholder: '{{ $json }}',
    typeOptions: {
      rows: 15
    },
  },
];

export { createTableFromJSONFunction as createTableFromJSON };
