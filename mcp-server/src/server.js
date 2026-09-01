import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { loadPayload } from './state.js';
import { registerNutritionTools } from './tools/nutrition.js';
import { registerAnalysisTools } from './tools/analysis.js';
import { registerMutationTools } from './tools/mutations.js';
import { startBridge } from './bridge.js';

loadPayload();

const server = new McpServer({ name: 'nourish', version: '0.1.0' });

registerNutritionTools(server);
registerAnalysisTools(server);
registerMutationTools(server);

// Phase 4 (decision-sync-mechanism.md): live sync with an open browser tab.
// Set NOURISH_BRIDGE_ENABLED=0 to run stdio-tools-only, no bridge.
if (process.env.NOURISH_BRIDGE_ENABLED !== '0') {
  startBridge();
}

const transport = new StdioServerTransport();
await server.connect(transport);
