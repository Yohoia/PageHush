import { Type } from 'typebox';

export const errorResponseSchema = Type.Object({ error: Type.String() });
