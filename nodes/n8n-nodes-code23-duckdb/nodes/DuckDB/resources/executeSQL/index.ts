import type { INodeProperties } from "n8n-workflow";
import { executeSQL as executeSQLFunction } from "./execute";

export const executeSQLDescription: INodeProperties[] = [
  {
    displayName: "Query",
    name: "query",
    type: "string",
    default: "",
    required: true,
    description: "SQL query to execute on DuckDB",
    placeholder: "select * from users where first_name = $first_name",
    typeOptions: {
      rows: 15,
      editor: "sqlEditor"
    },
  },
  {
    displayName: "Parameters",
    name: "parameters",
    type: "fixedCollection",
    typeOptions: {
      multipleValues: true,
    },
    default: {},
    options: [
      {
        displayName: "Parameter",
        name: "parameter",
        values: [
          {
            displayName: "Name",
            name: "name",
            type: "string",
            default: "",
            required: true,
            description: "Parameter name",
          },
          {
            displayName: "Type",
            name: "type",
            type: "options",
            default: "string",
            options: [
              {
                name: "String",
                value: "string",
              },
              {
                name: "Number",
                value: "number",
              },
              {
                name: "Boolean",
                value: "boolean",
              },
              {
                name: "Date",
                value: "date",
              },
            ],
          },
          {
            displayName: "Value",
            name: "value",
            type: "string",
            default: "",
            required: true,
            description: "Parameter value (supports expressions from previous nodes)",
          },
        ],
      },
    ],
  },
  {
    displayName: "Options",
    name: "options",
    type: "collection",
    placeholder: "Add option",
    default: {},
    options: [
      {
        displayName: "JSON Parameters",
        name: "jsonParameters",
        type: "json",
        default: "{}",
        description: "Parameters as JSON object (e.g., {\"key\": 123, \"name\": \"test\"}). Supports number, boolean, string, and date (ISO string). Individual parameters above will override these on conflict.",
        placeholder: "{\"key\": 123, \"name\": \"test\", \"createdAt\": \"2024-01-01T00:00:00Z\"}",
      },
    ],
  },
];

export { executeSQLFunction as executeSQL };