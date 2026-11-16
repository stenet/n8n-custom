import { ICredentialsDecrypted, ICredentialTestFunctions, INodeCredentialTestResult } from "n8n-workflow";
import { duckDBPool, type IDuckDBCredentials } from "../shared/pool";

export async function duckDbCredentialTest(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted
): Promise<INodeCredentialTestResult> {
  const credentials = credential.data as unknown as IDuckDBCredentials;
  const conn = await duckDBPool.getConnection(credentials!)
  
  try {
    await conn.run("select 1 as answer");
    
    return {
      status: "OK",
      message: "Success"
    };
  } catch(error) {
    return {
      status: "Error",
      message: error
    };
  } finally {
    conn.closeSync();
  }
}