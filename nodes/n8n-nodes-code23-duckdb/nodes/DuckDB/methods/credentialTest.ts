import { ICredentialsDecrypted, ICredentialTestFunctions, INodeCredentialTestResult } from "n8n-workflow";
import type { IDuckDBCredentials } from "../shared/pool";
import { executeDuckDBQuery } from "../shared/transport";

export async function duckDbCredentialTest(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted
): Promise<INodeCredentialTestResult> {
  const credentials = credential.data as unknown as IDuckDBCredentials;

  try {
    await executeDuckDBQuery(credentials, "select 1 as answer");

    return {
      status: "OK",
      message: "Success"
    };
  } catch (error) {
    return {
      status: "Error",
      message: (error as Error).message
    };
  }
}
