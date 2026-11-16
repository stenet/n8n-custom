import type { Icon, ICredentialType, INodeProperties } from "n8n-workflow";

export class DuckDbApi implements ICredentialType {
  name = "duckDbApi";

  displayName = "DuckDB API";
  documentationUrl = "https://duckdb.org/";

  icon: Icon = { light: "file:../icons/duckdb.svg", dark: "file:../icons/duckdb.dark.svg" };

  properties: INodeProperties[] = [
    {
      displayName: "Path",
      name: "path",
      type: "string",
      default: ":memory:",
      required: true,
    },
    {
      displayName: "ODBC Connections",
      name: "odbcConnections",
      type: "string",
      default: "",
      placeholder: "TestSql=Driver=SqlServer;Server=192.168.1.1;Database=Database;Encrypt=yes;TrustServerCertificate=yes;UID=TEST;PWD=TEST\nTestOracle=Driver=Oracle;DBQ=//the.server.name.org:1580/boilerinfo;Uid=MYUSER;Pwd=MYPASS",
      description: "ODBC connections as key-value pairs (one per line). Format: NAME=connection_string. Names can be used as functions to retrieve data.",
      typeOptions: {
        rows: 5,
      },
    },
  ];
}
