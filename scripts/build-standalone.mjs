#!/usr/bin/env node
// Собирает игру в один HTML-файл: `promezhutok.html` открывается двойным щелчком
// с диска, без сервера, Python и Node. Модули ES не работают по протоколу
// file://, поэтому скрипт переносит их в обычный Classic Script с маленьким
// реестром модулей: у модулей проекта только статические именованные импорты
// и нет циклических зависимостей, так что достаточно вычислить их в порядке
// зависимостей. При появлении `export { ... }`, динамического импорта или
// import.meta сборка намеренно падает: тогда нужен настоящий сборщик.
//
// Запуск: npm run build

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outputPath = resolve(root, outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : 'promezhutok.html');

const IMPORT_LINE = /^import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"];?[ \t]*$/gm;
const IMPORT_BARE = /^\s*import\s+[^;]*?from\s*['"]([^'"]+)['"]/gm;
const EXPORT_LIST = /^\s*export\s*\{/m;
const EXPORT_DEFAULT = /^\s*export\s+default\b/m;
const DYNAMIC_IMPORT = /\bimport\s*\(/;
const IMPORT_META = /\bimport\.meta\b/;

function moduleKey(specifier) {
  return specifier.split('?')[0].replace(/^\.\//, '').replace(/^src\//, '').replace(/\.m?js$/, '');
}

function parseModule(source, key) {
  if (EXPORT_LIST.test(source) || EXPORT_DEFAULT.test(source)) {
    throw new Error(`${key}: конструкция export { ... } / export default не поддерживается сборкой`);
  }
  if (DYNAMIC_IMPORT.test(source) || IMPORT_META.test(source)) {
    throw new Error(`${key}: динамический import или import.meta не поддерживаются сборкой`);
  }
  const dependencies = [];
  const names = new Set();
  const body = source.replace(IMPORT_LINE, (_match, imported, specifier) => {
    const dependency = moduleKey(specifier);
    dependencies.push(dependency);
    const bindings = imported.split(',').map(part => part.trim()).filter(Boolean)
      .map(part => (part.includes(' as ') ? part.split(/\s+as\s+/)[1].trim() : part));
    for (const binding of bindings) names.add(binding);
    return `const { ${bindings.join(', ')} } = __require(${JSON.stringify(dependency)});`;
  });
  const stray = body.match(IMPORT_BARE);
  if (stray) throw new Error(`${key}: неразобранный импорт: ${stray[0]}`);
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(match[1]);
  if (!names.size) throw new Error(`${key}: у модуля нет именованных экспортов`);
  return { key, dependencies, exports: [...names], body: body.replace(/^export\s+/gm, '') };
}

async function collect(entryKey, cache) {
  if (cache.has(entryKey)) return cache.get(entryKey);
  const file = join(root, 'src', `${entryKey}.js`);
  const parsed = parseModule(await readFile(file, 'utf8'), entryKey);
  cache.set(entryKey, parsed);
  for (const dependency of parsed.dependencies) await collect(dependency, cache);
  return parsed;
}

// Порядок вычисления: зависимости раньше зависимых.
function order(modules, entryKey) {
  const sorted = [];
  const seen = new Set();
  const visit = key => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const dependency of modules.get(key).dependencies) visit(dependency);
    sorted.push(modules.get(key));
  };
  visit(entryKey);
  return sorted;
}

function bundle(modules) {
  const chunks = modules.map(module => `  __modules[${JSON.stringify(module.key)}] = (() => {\n${module.body.replace(/^/gm, '    ')}\n    return { ${module.exports.join(', ')} };\n  })();`);
  return [
    '(function () {',
    '  "use strict";',
    '  const __modules = Object.create(null);',
    '  const __require = name => {',
    '    const module = __modules[name];',
    '    if (!module) throw new Error("модуль не загружен: " + name);',
    '    return module;',
    '  };',
    ...chunks,
    '})();',
  ].join('\n');
}

const html = await readFile(join(root, 'index.html'), 'utf8');
const entryMatch = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>\s*<\/script>/);
if (!entryMatch) throw new Error('в index.html не найден модульный скрипт');
const cssMatch = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!cssMatch) throw new Error('в index.html не найден стилевой файл');

const entryKey = moduleKey(entryMatch[1]);
const cache = new Map();
await collect(entryKey, cache);
const modules = order(cache, entryKey);
const script = bundle(modules);
const css = await readFile(join(root, cssMatch[1].split('?')[0]), 'utf8');

// Классический скрипт выполняется сразу, поэтому он переносится в конец body:
// модульный вариант был в head и дожидался разбора документа.
const standalone = html
  .replace(cssMatch[0], `<style>\n${css}\n</style>`)
  .replace(entryMatch[0], '')
  .replace('</body>', `<script>\n${script}\n</script>\n</body>`)
  // Манифест и иконки нужны только при установке с HTTPS-сайта; на диске они
  // лишь дают лишние сообщения в консоли.
  .replace(/<link[^>]*rel="manifest"[^>]*>/, '')
  .replace(/<link[^>]*rel="apple-touch-icon"[^>]*>/, '')
  .replace('<html lang="ru">', '<html lang="ru">\n<!-- Промежуток: отдельный файл для запуска без сервера. Собран из index.html и src/ скриптом scripts/build-standalone.mjs. -->');

await writeFile(outputPath, standalone, 'utf8');
console.log(`Готово: ${outputPath} (${(standalone.length / 1024).toFixed(0)} КБ, модулей: ${modules.length})`);
