export type PgFunctionParams = Record<string, unknown>;

export interface PgFunctionCallOptions {
  name: string;
  args: Array<unknown>;
  argTypes: Array<string>;
}
