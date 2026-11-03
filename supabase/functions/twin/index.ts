import { createHandler } from './handler.mjs';
Deno.serve(createHandler((key: string) => Deno.env.get(key)));
