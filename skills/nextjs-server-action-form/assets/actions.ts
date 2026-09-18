"use server";

import { availabilityOptions, volunteerAreas } from "@/content/site";
import { saveVolunteer } from "@/lib/volunteers";

export type FieldErrors = Partial<
  Record<"name" | "email" | "phone" | "city" | "area" | "availability" | "motivation" | "consent", string>
>;

export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: FieldErrors;
  values?: Record<string, string>;
};

const AREA_VALUES = new Set<string>(volunteerAreas.map((a) => a.value));
const AVAILABILITY_VALUES = new Set<string>(availabilityOptions.map((a) => a.value));

function text(formData: FormData, key: string, max = 500) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function registerVolunteer(_prev: FormState, formData: FormData): Promise<FormState> {
  // Honeypot: bots preenchem; humanos não veem o campo.
  if (text(formData, "website")) {
    return { status: "success", message: "Inscrição recebida!" };
  }

  const name = text(formData, "name", 120);
  const email = text(formData, "email", 200);
  const phone = text(formData, "phone", 40);
  const city = text(formData, "city", 120);
  const area = text(formData, "area", 40);
  const availability = formData
    .getAll("availability")
    .filter((v): v is string => typeof v === "string" && AVAILABILITY_VALUES.has(v));
  const experience = text(formData, "experience", 10) === "sim" ? "sim" : "nao";
  const motivation = text(formData, "motivation", 1000);
  const consent = formData.get("consent") === "on";

  const errors: FieldErrors = {};
  if (name.length < 3) errors.name = "Informe seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Informe um e-mail válido.";
  if (phone.replace(/\D/g, "").length < 10) errors.phone = "Informe um telefone com DDD.";
  if (!city) errors.city = "Informe sua cidade.";
  if (!AREA_VALUES.has(area)) errors.area = "Escolha uma área de interesse.";
  if (availability.length === 0) errors.availability = "Marque pelo menos um período.";
  if (!consent) errors.consent = "Precisamos do seu consentimento para entrar em contato.";

  const values = { name, email, phone, city, area, experience, motivation };

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Revise os campos destacados.", errors, values };
  }

  try {
    const result = await saveVolunteer({
      name,
      email,
      phone,
      city,
      area,
      availability,
      experience,
      motivation,
    });
    if (!result.ok) {
      return {
        status: "error",
        message: "Este e-mail já está inscrito. Se precisar alterar algo, fale com a organização.",
        errors: { email: "E-mail já cadastrado." },
        values,
      };
    }
    return { status: "success", message: "Inscrição recebida! Em breve entraremos em contato pelo WhatsApp." };
  } catch (err) {
    console.error("[registerVolunteer]", err);
    return {
      status: "error",
      message: "Não conseguimos salvar sua inscrição agora. Tente novamente em instantes.",
      values,
    };
  }
}
