import { z } from "zod";

export const typeZodSchema = z.enum(["lagenhet", "hus", "stuga", "rum"]);
