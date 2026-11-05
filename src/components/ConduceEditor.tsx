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
  type EstadoConduce,
  type Libreta,
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
  const [libreta, setLibreta] = useState<Libreta>(conduce?.libreta ?? "FIPEC");
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
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState(conduce?.motivo_rechazo ?? "");
  const [fotoFirmadaUrl, setFotoFirmadaUrl] = useState("");

  // Enlace temporal para ver la foto ya guardada.
  useEffect(() => {
    if (!conduce?.foto_path) return;
    createClient()
      .storage.from("conduces")
      .createSignedUrl(conduce.foto_path, 3600)
      .then(({ data }) => setFotoUrl(data?.signedUrl ?? ""));
  }, [conduce?.foto_path]);

  // Enlace temporal para ver el conduce firmado que subió el operador.
  useEffect(() => {
    if (!conduce?.foto_firmada_path) return;
    createClient()
      .storage.from("conduces")
      .createSignedUrl(conduce.foto_firmada_path, 3600)
      .then(({ data }) => setFotoFirmadaUrl(data?.signedUrl ?? ""));
  }, [conduce?.foto_firmada_path]);

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

  // nuevoEstado: Aprobado o Rechazado cuando el administrador decide; sin él solo se guardan los cambios.
  async function enviar(nuevoEstado?: EstadoConduce) {
    setError("");
    if (nuevoEstado === "Rechazado" && motivo.trim() === "")
      return setError("Escribe el motivo del rechazo para que el operador sepa qué corregir.");

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
      const ruta = `${libreta}-${num}-${Date.now()}.jpg`;
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
      libreta,
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
      ...(nuevoEstado
        ? { estado: nuevoEstado, motivo_rechazo: nuevoEstado === "Rechazado" ? motivo.trim() : null }
        : {}),
    };

    const { error: err } = nuevo
      ? await supabase.from("conduces").insert(datos)
      : await supabase.from("conduces").update(datos).eq("id", conduce.id);
    setGuardando(false);
    if (err) {
      if (err.code === "23505") return setError(`Ya existe el conduce #${num} de la libreta ${libreta}.`);
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
      <form
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <h2>{nuevo ? "Conduce nuevo" : `Conduce ${conduce.libreta} #${conduce.numero}`}</h2>
        {error && <div className="error">{error}</div>}

        {!nuevo && conduce.estado !== "Aprobado" && (
          <div className={conduce.estado === "Rechazado" ? "alerta" : "resumen"} style={{ marginBottom: 12 }}>
            {conduce.estado === "Pendiente" ? "Por aprobar" : "Rechazado"}
            {conduce.creador?.nombre ? ` · lo envió ${conduce.creador.nombre}` : ""}
            {conduce.estado === "Rechazado" && conduce.motivo_rechazo ? `. Motivo: ${conduce.motivo_rechazo}` : ""}
          </div>
        )}

        <div className="grid2">
          <div className="field">
            <label htmlFor="c-libreta">Libreta</label>
            <select id="c-libreta" value={libreta} onChange={(e) => setLibreta(e.target.value as Libreta)}>
              <option value="FIPEC">FIPEC</option>
              <option value="BRAU">BRAU</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-numero">Número</label>
            <input id="c-numero" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="c-fecha">Fecha</label>
          <input id="c-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
          La libreta es la del talonario donde está escrito el conduce. Todos se facturan por FIPEC.
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
          {fotoFirmadaUrl && (
            <>
              <label>Conduce firmado que subió el operador</label>
              <a href={fotoFirmadaUrl} target="_blank" rel="noreferrer">
                <img className="foto" src={fotoFirmadaUrl} alt="Conduce firmado" />
              </a>
              {!firmado && <div className="hint">Si la firma está bien, marca “Firmado” arriba antes de aprobar.</div>}
            </>
          )}
          <label htmlFor="c-foto">Foto del conduce</label>
          {fotoUrl && !fotoNueva && (
            <a href={fotoUrl} target="_blank" rel="noreferrer">
              <img className="foto" src={fotoUrl} alt={`Conduce ${conduce?.libreta ?? ""} ${conduce?.numero ?? ""}`} />
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

        {!nuevo && conduce.estado !== "Aprobado" && (
          <div className="resumen">
            {rechazando ? (
              <div className="field" style={{ marginBottom: 8 }}>
                <label htmlFor="c-motivo">Motivo del rechazo</label>
                <input id="c-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
            ) : (
              <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
                Revisa las horas y la foto. Al aprobar, las horas empiezan a contar en el corte.
              </div>
            )}
            <div className="actions" style={{ marginTop: 0 }}>
              {!rechazando && (
                <button type="button" className="btn primary grow" disabled={guardando} onClick={() => enviar("Aprobado")}>
                  Aprobar
                </button>
              )}
              <button
                type="button"
                className={`btn danger${rechazando ? " armed" : ""}${rechazando ? " grow" : ""}`}
                disabled={guardando}
                onClick={() => (rechazando ? enviar("Rechazado") : setRechazando(true))}
              >
                {rechazando ? "Confirmar rechazo" : "Rechazar"}
              </button>
              {rechazando && (
                <button type="button" className="btn" disabled={guardando} onClick={() => setRechazando(false)}>
                  Volver
                </button>
              )}
            </div>
          </div>
        )}

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Guardando..." : !nuevo && conduce.estado !== "Aprobado" ? "Guardar cambios" : "Guardar"}
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
