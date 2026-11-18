"use client";

import type { SocioFondo } from "@/lib/useSociosFondo";

// "¿De qué fondo sale?": el dinero del Fondo está dividido en la parte de cada socio.
export default function SelectorFondo({
  id,
  value,
  onChange,
  socios,
  etiqueta = "¿De qué fondo sale?",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  socios: SocioFondo[];
  etiqueta?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Escoge</option>
        {socios.map((s) => (
          <option key={s.user_id} value={s.user_id}>
            Fondo de {s.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
