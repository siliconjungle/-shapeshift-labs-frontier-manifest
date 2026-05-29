import { pathToFileURL } from 'node:url';

const rootScript = new URL('../../../benchmarks/package-readme-sections.js', import.meta.url);
await import(pathToFileURL(rootScript.pathname));
