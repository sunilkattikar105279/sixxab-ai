// GET /api/config → public, non-secret settings the browser needs (Supabase URL + anon key, booking link).
import { handle, json, publicConfig } from '../context.js';

export const GET = handle(async () => json(publicConfig()));
