import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PRODUCT_ROOT = path.join(REPO_ROOT, 'packages', 'product');
export const OPENCODE_PLUGIN_ROOT = path.join(REPO_ROOT, 'packages', 'opencode-plugin');
