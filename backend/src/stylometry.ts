import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import ignore from 'ignore';

const generated = /(^|\/)(node_modules|vendor|dist|build|coverage|\.git|\.angular|__pycache__|migrations|generated)(\/|$)|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Pipfile\.lock|Gemfile\.lock|bun\.lockb?|.*\.min\.[^/]+|.*\.map|.*\.generated\.[^/]+|.*\.g\.cs)$/i;
export function excluded(path: string, source = '', gitignore = ''): boolean {
  if (!path || path.startsWith('/') || path.split('/').includes('..')) return true;
  return generated.test(path) || /(^|\/)(\.env($|\.)|.*\.(pem|key|p12|pfx)$)/i.test(path) || /@generated|auto[- ]generated|do not edit/i.test(source.slice(0,2000)) || ignore().add(gitignore).ignores(path);
}
export function supported(path: string) { return /\.(py|jsx?|tsx?|java)$/i.test(path); }
@Injectable()
export class Stylometry {
  analyze(input: unknown): Promise<any> {
    return new Promise((resolveResult, reject) => {
      const child = spawn(process.env.PYTHON_EXECUTABLE || 'python', [resolve('ml/analyze.py')], { shell: false, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
      let output = ''; let error = '';
      const timeout = setTimeout(() => { child.kill(); reject(new Error('AST/ML analysis timed out')); },120000);
      child.stdout.on('data', data => { output+=data; if (output.length>8_000_000) child.kill(); });
      child.stderr.on('data', data => { error+=data; if (error.length>100000) child.kill(); });
      child.on('error', () => { clearTimeout(timeout); reject(new Error('Python runtime unavailable')); });
      child.stdin.on('error', () => {});
      child.on('close', code => {
        clearTimeout(timeout);
        if (code !== 0) return reject(new Error('AST/ML process failed; verify Python dependencies'));
        try { resolveResult(JSON.parse(output)); } catch { reject(new Error('Invalid AST/ML output')); }
      });
      child.stdin.end(JSON.stringify(input));
    });
  }
}
