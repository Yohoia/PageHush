import { Type, type Static } from 'typebox';

const isoDateTime = () => Type.String({ format: 'date-time' });

export const authSessionResponseSchema = Type.Union([
  Type.Object({ authenticated: Type.Literal(false) }),
  Type.Object({
    authenticated: Type.Literal(true),
    expiresAt: isoDateTime(),
  }),
]);
export type AuthSessionResponse = Static<typeof authSessionResponseSchema>;

export const authLoginResponseSchema = Type.Object({
  authenticated: Type.Literal(true),
  expiresAt: isoDateTime(),
  remember: Type.Boolean(),
});
export type AuthLoginResponse = Static<typeof authLoginResponseSchema>;

export const authExtensionLoginResponseSchema = Type.Object({
  authenticated: Type.Literal(true),
  sessionToken: Type.String(),
  expiresAt: isoDateTime(),
  remember: Type.Boolean(),
});
export type AuthExtensionLoginResponse = Static<typeof authExtensionLoginResponseSchema>;
