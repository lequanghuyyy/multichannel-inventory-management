let csrfToken = '';
let bearerToken = '';
let generation = 0;
const unauthorizedListeners = new Set<(generation: number) => void>();

export function setRuntimeCSRF(value: string): void {
  csrfToken = value;
}

export function runtimeCSRF(): string {
  return csrfToken;
}

export function setRuntimeBearer(value: string): void {
  bearerToken = value;
}

export function runtimeBearer(): string {
  return bearerToken;
}

export function clearRuntimeAuth(): void {
  csrfToken = '';
  bearerToken = '';
  generation += 1;
}

export function activateRuntimeAuth({ bearer = '', csrf = '' }: { bearer?: string; csrf?: string }): number {
  bearerToken = bearer;
  csrfToken = csrf;
  generation += 1;
  return generation;
}

export function runtimeAuthGeneration(): number {
  return generation;
}

export function onUnauthorized(listener: (generation: number) => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export function notifyUnauthorized(requestGeneration: number): void {
  for (const listener of unauthorizedListeners) listener(requestGeneration);
}
