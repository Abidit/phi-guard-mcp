import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
});
const client = new Client({ name: "smoke-test", version: "0.0.1" });
await client.connect(transport);

const tools = await client.listTools();
console.log("Tools:", tools.tools.map((t) => t.name));

const redactResult = await client.callTool({
  name: "redact_suggest",
  arguments: { text: "Patient John Doe (MRN-12345), DOB: 01/01/1980" },
});
console.log("redact_suggest result:", JSON.stringify(redactResult, null, 2));

const scanResult = await client.callTool({
  name: "scan_code",
  arguments: { path: "test/fixtures" },
});
console.log("scan_code result:", JSON.stringify(scanResult, null, 2));

await client.close();
