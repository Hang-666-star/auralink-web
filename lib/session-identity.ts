/** A request belongs to one login/restore generation, even when a JWT is reused. */
export type SessionIdentity = Readonly<{ token: string | null; generation: number }>;

export class SessionIdentityTracker {
  private identity: SessionIdentity = { token: null, generation: 0 };

  capture(): SessionIdentity { return this.identity; }

  replace(token: string | null): SessionIdentity {
    this.identity = { token, generation: this.identity.generation + 1 };
    return this.identity;
  }

  matches(candidate: SessionIdentity): boolean {
    return candidate.token === this.identity.token && candidate.generation === this.identity.generation;
  }
}
