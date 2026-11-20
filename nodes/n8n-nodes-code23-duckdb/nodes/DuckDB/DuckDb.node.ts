import type { IExecuteFunctions, INodeType, INodeTypeDescription } from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import { executeSQL, executeSQLDescription } from "./resources/executeSQL";
import { createTableFromJSON, createTableFromJSONDescription } from "./resources/createTableFromJSON";
import * as credentialTest from "./methods/credentialTest";
import { startQuackFromEnvironment } from "./shared/quack/startQuack";

// n8n lädt das Modul beim Start; so sind bekannte Datenbanken ohne Workflow-Ausführung per Quack erreichbar
startQuackFromEnvironment();

export class DuckDb implements INodeType {
  description: INodeTypeDescription = {
    displayName: "DuckDB",
    name: "duckDb",
    icon: { light: "file:../../icons/duckdb.svg", dark: "file:../../icons/duckdb.dark.svg" },
    group: ["input"],
    version: 1,
    subtitle: "={{$parameter[\"operation\"]}}",
    description: "Execute SQL queries on DuckDB",
    defaults: {
      name: "DuckDB",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "duckDbApi",
        required: true,
        testedBy: "duckDbCredentialTest"
      },
    ],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Execute SQL",
            value: "executeSQL",
          },
          {
            name: 'Create Table From JSON',
            value: "createTableFromJSON",
          },
        ],
        default: "executeSQL",
      },
      ...executeSQLDescription.map((prop) => ({
        ...prop,
        displayOptions: {
          show: {
            operation: ["executeSQL"],
          },
        },
      })),
      ...createTableFromJSONDescription.map((prop) => ({
        ...prop,
        displayOptions: {
          show: {
            operation: ["createTableFromJSON"],
          },
        },
      })),
    ],
  };
  
  methods = {
    credentialTest
  };

  async execute(this: IExecuteFunctions) {
    const operation = this.getNodeParameter("operation", 0) as string;

    switch (operation) {
      case "executeSQL":
        return executeSQL.call(this);
      case "createTableFromJSON":
        return createTableFromJSON.call(this);
    }

    throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
  }
}
