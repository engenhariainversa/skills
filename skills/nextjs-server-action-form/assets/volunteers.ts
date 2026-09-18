import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type Volunteer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  area: string;
  availability: string[];
  experience: "sim" | "nao";
  motivation: string;
  createdAt: string;
};

// Pasta das inscrições. No Docker: DATA_DIR=/data (prod) ou /app/data (dev, montado do host).
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "volunteers.json");

// Escritas serializadas no processo pra não perder inscrições concorrentes.
let queue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<Volunteer[]> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(list: Volunteer[]) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(list, null, 2), "utf8");
  await rename(tmp, FILE);
}

export function listVolunteers() {
  return readAll();
}

export async function saveVolunteer(
  data: Omit<Volunteer, "id" | "createdAt">,
): Promise<{ ok: true; volunteer: Volunteer } | { ok: false; reason: "duplicate" }> {
  const run = queue.then(async () => {
    const list = await readAll();
    const email = data.email.toLowerCase();
    if (list.some((v) => v.email.toLowerCase() === email)) {
      return { ok: false as const, reason: "duplicate" as const };
    }
    const volunteer: Volunteer = {
      ...data,
      email,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    list.push(volunteer);
    await writeAll(list);
    return { ok: true as const, volunteer };
  });
  queue = run.catch(() => undefined);
  return run;
}
