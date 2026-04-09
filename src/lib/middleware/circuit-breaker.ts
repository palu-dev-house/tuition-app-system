type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  name: string;
}

class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= this.config.cooldownMs) {
        this.state = "HALF_OPEN";
      } else {
        throw new CircuitOpenError(this.config.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = "OPEN";
      console.error(
        `[CircuitBreaker:${this.config.name}] Circuit OPEN after ${this.failureCount} failures`,
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — service unavailable`);
    this.name = "CircuitOpenError";
  }
}

export const dbCircuitBreaker = new CircuitBreaker({
  name: "database",
  failureThreshold: 5,
  cooldownMs: 30_000,
});
