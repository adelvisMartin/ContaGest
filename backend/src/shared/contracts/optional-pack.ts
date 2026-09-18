export type OptionalPackName = 'verticals' | 'food' | 'hipico';

export type OptionalPackRequestContext = Readonly<{
  tenantId: string;
  userId?: string;
  email?: string;
}>;
