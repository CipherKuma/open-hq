// Node stand-ins for the runtime-only module, so pure logic can be tested without a Workers runtime.
export class DurableObject { constructor(public ctx: unknown, public env: unknown) {} }
export class WorkflowEntrypoint { constructor(public ctx: unknown, public env: unknown) {} }
