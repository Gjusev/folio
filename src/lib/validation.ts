import { z } from "zod";
import { MAX_FILE_BYTES } from "@/lib/paths";

export const credentials = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Introduce un correo válido")),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(200),
});

export const loginBody = credentials.extend({ password: z.string().min(1).max(200) });

export const registerBody = credentials.extend({
  name: z.string().trim().min(1, "Indica tu nombre").max(100),
});

export const projectName = z.string().trim().min(1, "El nombre no puede estar vacío").max(120);

export const fileContent = z.string().max(MAX_FILE_BYTES, "El archivo supera 1 MB");

export const doi = z
  .string()
  .trim()
  .regex(/^10\.\d{4,9}\/\S{1,200}$/, "DOI no válido");
