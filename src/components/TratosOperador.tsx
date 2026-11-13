"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtMonto, hoyRD } from "@/lib/machines";
import { aTratoRow, fmtCorta, tratoVigente, type PerfilPago, type TratoRow } from "@/lib/pagos";

const dinero = (n: number) => fmtMonto(n, "DOP");

function resumen(t: TratoRow) {
  const comb = `${dinero(t.combustible_monto)} de combustible por ${t.combustible_por === "semana" ? "semana" : "día"}`;
  return [
    t.tarifa_hora != null ? `${dinero(t.tarifa_hora)} por hora` : "sin precio por hora",
    `${dinero(t.dieta_diaria)} de dieta por día`,
    comb,
    `mínimo ${t.minimo_horas_dia} h (sábado ${t.minimo_horas_sabado} h)`,
    `alojamiento ${t.horas_alojamiento} h${t.dieta_alojamiento ? " con dieta y combustible" : ""}`,
  ].join(" · ");
}

// Cambios del trato de un operador con la fecha desde la que rigen. El trato inicial es el del perfil;
// cada cambio rige desde su fecha y cierra el anterior. Se guarda al momento, no con el botón Guardar del perfil.
export default function TratosOperador({ perfil }: { perfil: PerfilPago }) {
  const [tratos, setTratos] = useState<TratoRow[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [desde, setDesde] = useState(hoyRD());
  const [tarifa, setTarifa] = useState("");
  const [dieta, setDieta] = useState("");
  const [comb, setComb] = useState("");
  const [combPor, setCombPor] = useState<"dia" | "semana">("dia");
  const [minDia, setMinDia] = useState("");
  const [minSab, setMinSab] = useState("");
  const [aloja, setAloja] = useState("");
  const [dietaAloja, setDietaAloja] = useState(false);
  const [nota, setNota] = useState("");

  const cargar = useCallback(async () => {
    const { data, error: err } = await createClient()
      .from("tratos_operador")
      .select("*")
      .eq("user_id", perfil.user_id)
      .order("desde");
    if (err) return setError(`No se pudieron cargar los cambios de trato: ${err.message}`);
    setTratos((data ?? []).map(aTratoRow));
  }, [perfil.user_id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al abrir el formulario se parte del trato que rige hoy, para cambiar solo lo que cambió.
  function abrir() {
    const t = tratoVigente(perfil, tratos, hoyRD());
    const ultimo = [...tratos].sort((a, b) => (a.desde < b.desde ? 1 : -1))[0];
    const porSemana = ultimo ? ultimo.combustible_por === "semana" : perfil.combustible_por === "semana";
    const monto = ultimo ? ultimo.combustible_monto : perfil.combustible_diario;
    setDesde(hoyRD());
    setTarifa(t.tarifa_hora != null ? String(t.tarifa_hora) : "");
    setDieta(String(t.dieta_diaria));
    setComb(String(monto));
    setCombPor(porSemana ? "semana" : "dia");
    setMinDia(String(t.minimo_horas_dia));
    setMinSab(String(t.minimo_horas_sabado));
    setAloja(String(t.horas_alojamiento));
    setDietaAloja(t.dieta_alojamiento);
    setNota("");
    setError("");
    setAbierto(true);
  }

  async function guardar() {
    setError("");
    const nums = { t: tarifa.trim() === "" ? null : aNumero(tarifa), d: aNumero(dieta), c: aNumero(comb), a: aNumero(minDia), b: aNumero(minSab), h: aNumero(aloja) };
    if (!desde) return setError("Pon la fecha desde la que rige el trato nuevo.");
    if (tarifa.trim() !== "" && nums.t == null) return setError("El precio por hora tiene que ser un número.");
    if ([nums.d, nums.c, nums.a, nums.b, nums.h].some((n) => n == null || n < 0))
      return setError("Los montos y las horas tienen que ser números (pueden ser 0).");
    setGuardando(true);
    const { error: err } = await createClient()
      .from("tratos_operador")
      .upsert(
        {
          user_id: perfil.user_id,
          desde,
          tarifa_hora: nums.t,
          dieta_diaria: nums.d,
          combustible_monto: nums.c,
          combustible_por: combPor,
          minimo_horas_dia: nums.a,
          minimo_horas_sabado: nums.b,
          horas_alojamiento: nums.h,
          horas_sin_conduce: tratoVigente(perfil, tratos, desde).horas_sin_conduce,
          dieta_alojamiento: dietaAloja,
          nota: nota.trim() || null,
        },
        { onConflict: "user_id,desde" }
      );
    setGuardando(false);
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    setAbierto(false);
    cargar();
  }

  async function quitar(id: string) {
    setGuardando(true);
    const { error: err } = await createClient().from("tratos_operador").delete().eq("id", id);
    setGuardando(false);
    if (err) return setError(`No se pudo quitar: ${err.message}`);
    cargar();
  }

  return (
    <div className="resumen">
      <b>Cambios de trato</b>
      <div className="hint" style={{ marginTop: 4 }}>
        Lo de arriba es el trato inicial. Si cambias lo que le das (precio, dieta, combustible, mínimos), agrega el cambio
        con la fecha desde la que rige. Los días anteriores se siguen calculando con el trato que tenían.
      </div>
      {error && <div className="error">{error}</div>}
      {tratos.map((t) => (
        <div className="row" key={t.id} style={{ marginTop: 8, alignItems: "flex-start" }}>
          <div>
            <b>Desde {fmtCorta(t.desde)}</b>
            <div className="hint" style={{ marginTop: 2 }}>
              {resumen(t)}
              {t.nota ? ` · ${t.nota}` : ""}
            </div>
          </div>
          <button type="button" className="btn small danger" disabled={guardando} onClick={() => quitar(t.id)}>
            Quitar
          </button>
        </div>
      ))}

      {!abierto ? (
        <div className="actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn small" onClick={abrir}>
            Agregar cambio de trato
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div className="grid2">
            <div className="field">
              <label>Rige desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="field">
              <label>Precio por hora (RD$)</label>
              <input inputMode="decimal" value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Dieta por día (RD$)</label>
              <input inputMode="decimal" value={dieta} onChange={(e) => setDieta(e.target.value)} />
            </div>
            <div className="field">
              <label>Combustible (RD$)</label>
              <input inputMode="decimal" value={comb} onChange={(e) => setComb(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>El combustible se da por</label>
            <select value={combPor} onChange={(e) => setCombPor(e.target.value as "dia" | "semana")}>
              <option value="dia">Día</option>
              <option value="semana">Semana (se reparte entre lunes y sábado; el domingo no suma)</option>
            </select>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Mínimo de horas, lunes a viernes</label>
              <input inputMode="decimal" value={minDia} onChange={(e) => setMinDia(e.target.value)} />
            </div>
            <div className="field">
              <label>Mínimo de horas del sábado</label>
              <input inputMode="decimal" value={minSab} onChange={(e) => setMinSab(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Horas del día "estuve en el alojamiento"</label>
            <input inputMode="decimal" value={aloja} onChange={(e) => setAloja(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={dietaAloja} onChange={(e) => setDietaAloja(e.target.checked)} />
            El día de alojamiento también cobra dieta y combustible
          </label>
          <div className="field">
            <label>Nota (opcional)</label>
            <input value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <div className="actions">
            <button type="button" className="btn small primary grow" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando..." : "Guardar cambio de trato"}
            </button>
            <button type="button" className="btn small" disabled={guardando} onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
