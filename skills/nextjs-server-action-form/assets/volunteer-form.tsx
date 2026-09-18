"use client";

import { useActionState } from "react";
import { registerVolunteer, type FormState } from "@/app/actions";
import { availabilityOptions, volunteerAreas } from "@/content/site";

const initialState: FormState = { status: "idle" };

const inputClass =
  "w-full rounded-lg border border-line bg-white px-4 py-3 text-base text-ink placeholder:text-muted/70 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15 aria-[invalid=true]:border-danger";

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function VolunteerForm() {
  const [state, formAction, pending] = useActionState(registerVolunteer, initialState);
  const v = state.values ?? {};
  const e = state.errors ?? {};

  if (state.status === "success") {
    return (
      <div className="rounded-2xl border border-brand/30 bg-brand-soft p-8 text-center" role="status">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-white">
          ✓
        </div>
        <h3 className="text-2xl font-bold text-ink">Inscrição recebida!</h3>
        <p className="mt-2 text-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {state.status === "error" && state.message && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}

      {/* honeypot */}
      <div className="absolute -left-[9999px] top-0" aria-hidden="true">
        <label>
          Não preencha este campo
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label="Nome completo" htmlFor="name" error={e.name}>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          defaultValue={v.name}
          aria-invalid={!!e.name}
          className={inputClass}
          placeholder="Como devemos te chamar?"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="E-mail" htmlFor="email" error={e.email}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={v.email}
            aria-invalid={!!e.email}
            className={inputClass}
            placeholder="voce@exemplo.com"
          />
        </Field>
        <Field label="WhatsApp" htmlFor="phone" error={e.phone} hint="Com DDD. É por aqui que falamos com você.">
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            defaultValue={v.phone}
            aria-invalid={!!e.phone}
            className={inputClass}
            placeholder="(62) 99999-9999"
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Cidade" htmlFor="city" error={e.city}>
          <input
            id="city"
            name="city"
            type="text"
            autoComplete="address-level2"
            required
            defaultValue={v.city}
            aria-invalid={!!e.city}
            className={inputClass}
            placeholder="Goiânia"
          />
        </Field>
        <Field label="Área de interesse" htmlFor="area" error={e.area}>
          <select
            id="area"
            name="area"
            required
            defaultValue={v.area ?? ""}
            aria-invalid={!!e.area}
            className={inputClass}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {volunteerAreas.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-ink">Disponibilidade</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {availabilityOptions.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm transition has-checked:border-brand has-checked:bg-brand-soft"
            >
              <input type="checkbox" name="availability" value={o.value} className="h-4 w-4 accent-brand" />
              {o.label}
            </label>
          ))}
        </div>
        {e.availability && (
          <p className="text-xs font-medium text-danger" role="alert">
            {e.availability}
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-ink">Já foi voluntário em algum evento?</legend>
        <div className="flex gap-3">
          {[
            { value: "sim", label: "Sim" },
            { value: "nao", label: "Ainda não" },
          ].map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-sm transition has-checked:border-brand has-checked:bg-brand-soft"
            >
              <input
                type="radio"
                name="experience"
                value={o.value}
                defaultChecked={(v.experience ?? "nao") === o.value}
                className="h-4 w-4 accent-brand"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Por que você quer ser voluntário?" htmlFor="motivation" hint="Opcional, mas adoramos ler.">
        <textarea
          id="motivation"
          name="motivation"
          rows={4}
          maxLength={1000}
          defaultValue={v.motivation}
          className={inputClass}
          placeholder="Conta pra gente o que te anima nessa ideia."
        />
      </Field>

      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="consent" className="mt-1 h-4 w-4 accent-brand" required />
        <span>
          Autorizo o uso dos meus dados para contato sobre o voluntariado no Startup Weekend Summit.
          {e.consent && <span className="mt-1 block text-xs font-medium text-danger">{e.consent}</span>}
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Quero ser voluntário"}
      </button>
    </form>
  );
}
