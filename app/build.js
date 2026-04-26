import esbuild from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dir, 'meal-planner-v2.html');
const tempEntry = join(__dir, '.build-entry.js');
const outPath = join(__dir, 'meal-planner-dist.html');

const html = readFileSync(htmlPath, 'utf8');

const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!match) throw new Error('No <script type="module"> block found in HTML');

writeFileSync(tempEntry, match[1]);

try {
  const result = await esbuild.build({
    entryPoints: [tempEntry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
  });

  const bundled = result.outputFiles[0].text;
  const dist = html.replace(
    /<script type="module">[\s\S]*?<\/script>/,
    `<script>\n${bundled}</script>`
  );

  writeFileSync(outPath, dist);
  console.log(`Built ${outPath}`);
} finally {
  unlinkSync(tempEntry);
}
