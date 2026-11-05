"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtNum, hoyRD, type Machine } from "@/lib/machines";
import {
  aHoras,
  horasCobrables,
  horasTramo,
  noCuadra,
  sumaTramos,
  type Cliente,
  type Conduce,
  type Tramo,
} from "@/lib/conduces";
import { reducirImagen } from "@/lib/imagen";

type Props = {
  conduce: Conduce | null; // null = conduce nuevo
  maquinas: Machine[];
  clientes: Cliente[];
  onClose: () => void;
  onSaved: () => void;
};

const TRAMO_VACIO: Tramo = { entrada: "", salida: "" };

export default function ConduceEditor({ conduce, maquinas, clientes, onClose, onSaved }: Props) {
  const nuevo = conduce === null;
  const [numero, setNumero] = useState(conduce ? String(conduce.numero) : "");
  const [fecha, setFecha] = useState(conduce?.fecha ?? hoyRD());
  const [machineId, setMachineId] = useState(conduce?.machine_id ?? "");
  const [clientId, setClientId] = useState(conduce?.client_id ?? "");
  const [obra, setObra] = useState(conduce?.obra ?? "");
  const [zona, setZona] = useState(conduce?.zona ?? "");
  const [trabajo, setTrabajo] = useState(conduce?.trabajo ?? "");
  const [tramos, setTramos] = useState<Tramo[]>(
    conduce && conduce.tramos.length > 0 ? conduce.tramos : [{ ...TRAMO_VACIO }, { ...TRAMO_VACIO }]
  );
  const [escritas, setEscritas] = useState(
    conduce?.horas_escritas != null ? String(conduce.horas_escritas) : ""
  );
  const [firmado, setFirmado] = useState(conduce?.firmado ?? false);
  const [notas, setNotas] = useState(conduce?.notas ?? "");

  const [fotoNueva, setFotoNueva] = useState<File | null>(null);
  const [fotoUrl, setFotoUrl] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  // Enlace temporal para ver la foto ya guardada.
  useEffect(() => {
    if (!conduce?.foto_path) return;
    createClient()
      .storage.from("conduces")
      .createSignedUrl(conduce.foto_path, 3600)
      .then(({ data }) => setFotoUrl(data?.signedUrl ?? ""));
  }, [conduce?.foto_path]);

  const calculadas = sumaTramos(tramos);
  const escritasNum = aHoras(escritas);
  const cobrables = horasCobrables(firmado, calculadas, escritasNum);
  const desfase = noCuadra(calculadas, escritasNum);

  function cambiarTramo(i: number, campo: keyof Tramo, valor: string) {
    setTramos((prev) => prev.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));
  }

  // Cuando eliges la máquina, si no has puesto obra usa la de la máquina.
  function elegirMaquina(id: string) {
    setMachineId(id);
    const m = maquinas.find((x) => x.id === id);
    if (m?.obra && obra.trim() === "") setObra(m.obra);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const num = Number(numero);
    if (!Number.isInteger(num) || num <= 0) return setError("Escribe el número del conduce, por ejemplo 1116.");
    if (!fecha) return setError("Falta la fecha.");
    if (!machineId) return setError("Escoge la máquina.");

    const tramosUsados: Tramo[] = [];
    for (let i = 0; i < tramos.length; i++) {
      const t = tramos[i];
      if (t.entrada === "" && t.salida === "") continue;
      if (horasTramo(t) == null)
        return setError(`En el tramo ${i + 1}, la salida tiene que ser después de la entrada.`);
      tramosUsados.push(t);
    }
    if (escritas.trim() !== "" && escritasNum == null)
      return setError("El total del operador tiene que ser un número, por ejemplo 8 o 7:30.");
    if (tramosUsados.length === 0 && escritasNum == null)
      return setError("Pon al menos un tramo de horas o el total que escribió el operador.");

    setGuardando(true);
    const supabase = createClient();

    // Foto: se sube primero para guardar su ruta junto con el conduce.
    let fotoPath = conduce?.foto_path ?? null;
    if (fotoNueva) {
      const blob = await reducirImagen(fotoNueva);
      const ruta = `${num}-${Date.now()}.jpg`;
      const { error: errFoto } = await supabase.storage
        .from("conduces")
        .upload(ruta, blob, { contentType: blob.type || "image/jpeg" });
      if (errFoto) {
        setGuardando(false);
        return setError(`No se pudo subir la foto: ${errFoto.message}`);
      }
      if (fotoPath) await supabase.storage.from("conduces").remove([fotoPath]);
      fotoPath = ruta;
    }

    const datos = {
      numero: num,
      fecha,
      machine_id: machineId,
      client_id: clientId || null,
      obra: obra.trim() || null,
      zona: zona.trim() || null,
      trabajo: trabajo.trim() || null,
      tramos: tramosUsados,
      horas_calculadas: sumaTramos(tramosUsados),
      horas_escritas: escritasNum,
      firmado,
      foto_path: fotoPath,
      notas: notas.trim() || null,
    };

    const { error: err } = nuevo
      ? await supabase.from("conduces").insert(datos)
      : await supabase.from("conduces").update(datos).eq("id", conduce.id);
    setGuardando(false);
    if (err) {
      if (err.code === "23505") return setError(`Ya existe el conduce #${num}.`);
      return setError(`No se pudo guardar: ${err.message}`);
    }
    onSaved();
  }

  async function borrar() {
    if (!conduce) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("conduces").delete().eq("id", conduce.id);
    if (err) {
      setGuardando(false);
      return setError(`No se pudo borrar: ${err.message}`);
    }
    if (conduce.foto_path) await supabase.storage.from("conduces").remove([conduce.foto_path]);
    setGuardando(false);
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nuevo ? "Conduce nuevo" : `Conduce #${conduce.numero}`}</h2>
        {error && <div className="error">{error}</div>}

        <div className="grid2">
          <div className="field">
            <label htmlFor="c-numero">Número</label>
            <input id="c-numero" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-fecha">Fecha</label>
            <input id="c-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="c-maquina">Máquina</label>
          <select id="c-maquina" value={machineId} onChange={(e) => elegirMaquina(e.target.value)}>
            <option value="">Escoge la máquina</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="c-cliente">Cliente</label>
          <select id="c-cliente" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Sin cliente todavía</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="c-obra">Obra</label>
            <input id="c-obra" value={obra} onChange={(e) => setObra(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-zona">Zona</label>
            <input id="c-zona" value={zona} onChange={(e) => setZona(e.target.value)} />
          </div>
        </div>
        <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
          La zona es como aparece en la factura, por ejemplo Fase 1 o Townhouse 3.
        </div>

        <div className="field">
          <label htmlFor="c-trabajo">Trabajo efectuado</label>
          <input id="c-trabajo" value={trabajo} onChange={(e) => setTrabajo(e.target.value)} />
        </div>

        <div className="field">
          <label>Horas: de la hora de entrada a la de salida</label>
          {tramos.map((t, i) => {
            const h = horasTramo(t);
            return (
              <div className="tramo" key={i}>
                <input
                  type="time"
                  aria-label={`Entrada del tramo ${i + 1}`}
                  value={t.entrada}
                  onChange={(e) => cambiarTramo(i, "entrada", e.target.value)}
                />
                <span>a</span>
                <input
                  type="time"
                  aria-label={`Salida del tramo ${i + 1}`}
                  value={t.salida}
                  onChange={(e) => cambiarTramo(i, "salida", e.target.value)}
                />
                <span className="tramo-h">{h == null ? "" : `${fmtNum(h, 2)} h`}</span>
              </div>
            );
          })}
          <button
            type="button"
            className="btn small"
            onClick={() => setTramos((prev) => [...prev, { ...TRAMO_VACIO }])}
          >
            + Otro tramo
          </button>
        </div>

        <div className="field">
          <label htmlFor="c-escritas">Total que escribió el operador (horas)</label>
          <input
            id="c-escritas"
            inputMode="decimal"
            value={escritas}
            onChange={(e) => setEscritas(e.target.value)}
          />
          <div className="hint">Puedes poner 8, 7.5 o 7:30.</div>
        </div>

        <label className="check">
          <input type="checkbox" checked={firmado} onChange={(e) => setFirmado(e.target.checked)} />
          Firmado por el ingeniero o la empresa
        </label>

        <div className="resumen">
          <div>
            Horas por los tramos: <b>{fmtNum(calculadas, 2)} h</b>
          </div>
          <div>
            Se cobran: <b>{fmtNum(cobrables, 2)} h</b>
            {firmado && escritasNum != null ? " (total firmado)" : ""}
          </div>
          {!firmado && desfase && (
            <div className="alerta">
              Sin firma y no cuadra: los tramos dan {fmtNum(calculadas, 2)} h y el operador escribió{" "}
              {fmtNum(escritasNum ?? 0, 2)} h.
            </div>
          )}
          {!firmado && !desfase && <div className="aviso">Todavía sin firma del ingeniero.</div>}
        </div>

        <div className="field">
          <label htmlFor="c-foto">Foto del conduce</label>
          {fotoUrl && !fotoNueva && (
            <a href={fotoUrl} target="_blank" rel="noreferrer">
              <img className="foto" src={fotoUrl} alt={`Conduce ${conduce?.numero ?? ""}`} />
            </a>
          )}
          <input
            id="c-foto"
            type="file"
            accept="image/*"
            onChange={(e) => setFotoNueva(e.target.files?.[0] ?? null)}
          />
          {fotoNueva && <div className="hint">Se sube al guardar: {fotoNueva.name}</div>}
        </div>

        <div className="field">
          <label htmlFor="c-notas">Notas</label>
          <textarea id="c-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {!nuevo && (
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
