/** Development/test-only validation against the pinned backend specification. */
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import specification from '../../contracts/dashboard.openapi.json';
import { ApiError } from '../api/http';

const validator = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
validator.addSchema(specification, 'selark-dashboard');
const checks = new Map<string, ValidateFunction>();

export function conforms(name: string, value: unknown): boolean {
  let check = checks.get(name);
  if (!check) {
    check = validator.getSchema(`selark-dashboard#/components/schemas/${name}`);
    if (!check) throw new Error(`Unknown contract schema: ${name}`);
    checks.set(name, check);
  }
  return !!check(value);
}

export function input<T>(name: string, value: T): T {
  // Match JSON serialization in the HTTP adapter, including omitted undefined fields.
  const serialized: T = JSON.parse(JSON.stringify(value));
  if (!conforms(name, serialized)) throw new ApiError(400, '管理请求字段或类型无效。', 'invalid_request');
  return serialized;
}
