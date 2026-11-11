// Regenerates rayfin/functions/src/types.ts with the Rayfin CLI's own type
// generator. The CLI only runs it from `functions init` and the local
// Functions host watcher, which needs Azure Functions Core Tools.
const generator = new URL('../node_modules/@microsoft/rayfin-cli/dist/utils/functions-types-generator.js', import.meta.url);
const { generateFunctionsTypes } = await import(generator.href);
await generateFunctionsTypes('rayfin/functions');
console.log('Regenerated rayfin/functions/src/types.ts');
