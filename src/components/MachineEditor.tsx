"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ESTADOS,
  aNumero,
  fmtNum,
  hoyRD,
  type Estado,
  type Machine,
  type Propiedad,
} from "@/lib/machines";

type Props = {
  machine: Machine | null; // null = máquina nueva
  onClose: () => void;
  onSaved: () => void;
};

const txt = (n: number | null | undefined) => (n == null ? "" : String(n));

export default function MachineEditor({ machine, onClose, onSaved }: Props) {
  const nueva = machine === null;
  const [nombre, setNombre] = useState(machine?.nombre ?? "");
  const [marca, setMarca] = useState(machine?.marca ?? "");
  const [modelo, setModelo] = useState(machine?.modelo ?? "");
  const [serie, setSerie] = useState(machine?.serie ?? "");
  const [anio, setAnio] = useState(txt(machine?.anio));
  const [horometro, setHorometro] = useState(txt(machine?.horometro));
  const [consumo, setConsumo] = useState(txt(machine?.consumo_esperado));
  const [estado, setEstado] = useState<Estado>(machine?.estado ?? "Disponible");
  const [obra, setObra] = useState(machine?.obra ?? "");
  const [seguro, setSeguro] = useState(machine?.seguro ?? "");
  const [vencimiento, setVencimiento] = useState(machine?.vencimiento_poliza ?? "");
  const [propiedad, setPropiedad] = useState<Propiedad>(machine?.propiedad ?? "Propia");
  const [dueno, setDueno] = useState(machine?.dueno ?? "");
  const [pago, setPago] = useState(txt(machine?.pago_dueno));
  const [notas, setNotas] = useState(machine?.notas ?? "");

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (nombre.trim() === "") return setError("Ponle un nombre a la máquina.");

    const horas = aNumero(horometro);
    if (horometro.trim() !== "" && (horas == null || horas < 0))
      return setError("El horómetro tiene que ser un número, por ejemplo 159.8.");
    if (machine?.horometro != null && horas != null && horas < machine.horometro)
      return setError(
        `El horómetro no puede bajar: estaba en ${fmtNum(machine.horometro, 1)} h.`
      );
    if (estado === "En obra" && obra.trim() === "")
      return setError("Si la máquina está En obra, escribe cuál obra.");

    const consumoNum = aNumero(consumo);
    if (consumo.trim() !== "" && (consumoNum == null || consumoNum <= 0))
      return setError("El consumo normal tiene que ser un número mayor que cero, por ejemplo 6.5.");
    const pagoNum = aNumero(pago);
    if (pago.trim() !== "" && (pagoNum == null || pagoNum < 0))
      return setError("El pago al dueño tiene que ser un número.");
    const anioNum = aNumero(anio);
    if (anio.trim() !== "" && (anioNum == null || !Number.isInteger(anioNum)))
      return setError("El año tiene que ser un número entero, por ejemplo 2024.");

    // La fecha del horómetro se actualiza solo si cambió el número.
    const cambioHoras = horas !== (machine?.horometro ?? null);
    const datos = {
      nombre: nombre.trim(),
      marca: marca.trim() || null,
      modelo: modelo.trim() || null,
      serie: serie.trim() || null,
      anio: anioNum,
      horometro: horas,
      horometro_fecha:
        horas == null ? null : cambioHoras ? hoyRD() : machine?.horometro_fecha ?? hoyRD(),
      consumo_esperado: consumoNum,
      estado,
      obra: estado === "En obra" ? obra.trim() : obra.trim() || null,
      seguro: seguro.trim() || null,
      vencimiento_poliza: vencimiento || null,
      propiedad,
      dueno: propiedad === "Subcontratada" ? dueno.trim() || null : null,
      pago_dueno: propiedad === "Subcontratada" ? pagoNum : null,
      notas: notas.trim() || null,
    };

    setGuardando(true);
    const supabase = createClient();
    const { error: err } = nueva
      ? await supabase.from("machines").insert(datos)
      : await supabase.from("machines").update(datos).eq("id", machine.id);
    setGuardando(false);
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    onSaved();
  }

  async function borrar() {
    if (!machine) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("machines").delete().eq("id", machine.id);
    setGuardando(false);
    if (err) return setError(`No se pudo borrar: ${err.message}`);
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nueva ? "Máquina nueva" : machine.nombre}</h2>
        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="f-nombre">Nombre</label>
          <input id="f-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="f-marca">Marca</label>
            <input id="f-marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-modelo">Modelo</label>
            <input id="f-modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="f-serie">Serie / PIN</label>
            <input id="f-serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-anio">Año</label>
            <input id="f-anio" inputMode="numeric" value={anio} onChange={(e) => setAnio(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-horometro">Horómetro (horas)</label>
          <input
            id="f-horometro"
            inputMode="decimal"
            value={horometro}
            onChange={(e) => setHorometro(e.target.value)}
          />
          <div className="hint">
            No puede bajar. Se guarda con la fecha de hoy cuando lo cambias.
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-consumo">Consumo normal (galones por hora)</label>
          <input id="f-consumo" inputMode="decimal" value={consumo} onChange={(e) => setConsumo(e.target.value)} />
          <div className="hint">
            Opcional. Con este número el programa avisa si la máquina gasta mucho más o mucho menos. Si lo
            dejas vacío, compara contra sus cortes anteriores.
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-estado">Estado</label>
          <select id="f-estado" value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
            {ESTADOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-obra">Obra{estado === "En obra" ? " (obligatoria)" : ""}</label>
          <input id="f-obra" value={obra} onChange={(e) => setObra(e.target.value)} />
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="f-seguro">Seguro</label>
            <input id="f-seguro" value={seguro} onChange={(e) => setSeguro(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-venc">Vence la póliza</label>
            <input id="f-venc" type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-prop">Propiedad</label>
          <select id="f-prop" value={propiedad} onChange={(e) => setPropiedad(e.target.value as Propiedad)}>
            <option value="Propia">Propia</option>
            <option value="Subcontratada">Subcontratada</option>
          </select>
        </div>
        {propiedad === "Subcontratada" && (
          <div className="grid2">
            <div className="field">
              <label htmlFor="f-dueno">Dueño</label>
              <input id="f-dueno" value={dueno} onChange={(e) => setDueno(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-pago">Pago al dueño por hora (RD$)</label>
              <input id="f-pago" inputMode="decimal" value={pago} onChange={(e) => setPago(e.target.value)} />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="f-notas">Notas</label>
          <textarea id="f-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {!nueva && (
            <button
              type="button"
              className={`btn danger${borrarListo ? " armed" : ""}`}
              onClick={borrar}
              disabled={guardando}
            >
              {borrarListo ? "Toca otra vez para borrar" : "Borrar"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
