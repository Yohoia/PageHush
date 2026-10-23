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

export const deviceVerificationBodySchema = Type.Object({
  user_code: Type.String({ minLength: 1, maxLength: 32 }),
  decision: Type.Union([Type.Literal('approve'), Type.Literal('deny')]),
});
export type DeviceVerificationBody = Static<typeof deviceVerificationBodySchema>;

export const deviceVerificationResponseSchema = Type.Object({
  user_code: Type.String(),
  name: Type.String(),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('approved'),
    Type.Literal('denied'),
    Type.Literal('consumed'),
    Type.Literal('expired'),
  ]),
  expiresAt: isoDateTime(),
});
export type DeviceVerificationResponse = Static<typeof deviceVerificationResponseSchema>;

export const deviceListResponseSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      name: Type.String(),
      createdAt: isoDateTime(),
      lastUsedAt: isoDateTime(),
      expiresAt: isoDateTime(),
      revokedAt: Type.Union([isoDateTime(), Type.Null()]),
    }),
  ),
});
export type DeviceListResponse = Static<typeof deviceListResponseSchema>;
