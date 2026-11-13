"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtNum, hoyRD } from "@/lib/machines";
import {
  aHoras,
  fmtFecha,
  horasTramo,
  sumaTramos,
  IMPLEMENTOS,
  type Conduce,
  type Implemento,
  type Libreta,
  type Tramo,
} from "@/lib/conduces";
import { subirFoto, useFotoUrl } from "@/lib/fotos";

export type MaquinaOperador = { machine_id: string; maquina_nombre: string };

type Props = {
  conduce: Conduce | null; // null = reporte nuevo
  uid: string;
  maquinas: MaquinaOperador[];
  onClose: () => void;
  onSaved: () => void;
};

const TRAMO_VACIO: Tramo = { entrada: "", salida: "" };

type ParteAbierta = { parte_id: string; parte: string; trabajo: string; machine_id: string };

export default function OperadorForm({ conduce, uid, maquinas, onClose, onSaved }: Props) {
  const nuevo = conduce === null;
  // Ya enviado (aprobado o esperando aprobación): el operador no puede cambiar nada, solo subir el conduce firmado.
  // Si se equivocó, el administrador tiene que devolvérselo.
  const soloFirma = conduce?.estado === "Aprobado" || conduce?.estado === "Pendiente";

  const [machineId, setMachineId] = useState(conduce?.machine_id ?? (maquinas.length === 1 ? maquinas[0].machine_id : ""));
  const [fecha, setFecha] = useState(conduce?.fecha ?? hoyRD());
  const [libreta, setLibreta] = useState<Libreta>(conduce?.libreta ?? "FIPEC");
  const [numero, setNumero] = useState(conduce ? String(conduce.numero) : "");
  const [tramos, setTramos] = useState<Tramo[]>(
    conduce && conduce.tramos.length > 0 ? conduce.tramos : [{ ...TRAMO_VACIO }, { ...TRAMO_VACIO }]
  );
  const [escritas, setEscritas] = useState(conduce?.horas_escritas != null ? String(conduce.horas_escritas) : "");
  const [obra, setObra] = useState(conduce?.obra ?? "");
  const [implemento, setImplemento] = useState<Implemento | "">(conduce?.implemento ?? "");
  const [trabajo, setTrabajo] = useState(conduce?.trabajo ?? "");
  const [notas, setNotas] = useState(conduce?.notas ?? "");
  const [fotoSinFirma, setFotoSinFirma] = useState<File | null>(null);
  const [fotoFirmada, setFotoFirmada] = useState<File | null>(null);
  const [horometro, setHorometro] = useState(conduce?.horometro != null ? String(conduce.horometro) : "");
  const [fotoHoro, setFotoHoro] = useState<File | null>(null);

  const [partesAbiertas, setPartesAbiertas] = useState<ParteAbierta[]>([]);
  const [parteId, setParteId] = useState(conduce?.parte_id ?? "");
  const [terminada, setTerminada] = useState(conduce?.parte_terminada ?? false);

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  const urlSinFirma = useFotoUrl(conduce?.foto_path);
  const urlFirmada = useFotoUrl(conduce?.foto_firmada_path);
  const urlHoro = useFotoUrl(conduce?.foto_horometro_path);

  // Piscinas (o partes) abiertas de trabajos a precio cerrado en esta máquina; el operador no ve el precio.
  useEffect(() => {
    createClient()
      .rpc("partes_abiertas_operador")
      .then(({ data }) => setPartesAbiertas((data ?? []) as ParteAbierta[]));
  }, []);
  const partesMaquina = partesAbiertas.filter((p) => p.machine_id === machineId);
  const parteValida = parteId !== "" && partesMaquina.some((p) => p.parte_id === parteId) ? parteId : "";

  const calculadas = sumaTramos(tramos);
  const escritasNum = aHoras(escritas);

  function cambiarTramo(i: number, campo: keyof Tramo, valor: string) {
    setTramos((prev) => prev.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    let num = 0;
    const tramosUsados: Tramo[] = [];
    if (!soloFirma) {
      num = Number(numero);
      if (!Number.isInteger(num) || num <= 0) return setError("Escribe el número del conduce, por ejemplo 1116.");
      if (!fecha) return setError("Falta la fecha.");
      if (fecha > hoyRD()) return setError("La fecha no puede ser de un día que todavía no llega.");
      if (!machineId) return setError("Escoge la máquina.");
      if (implemento === "") return setError("Escoge con qué trabajaste: cubo, martillo u otro.");
      for (let i = 0; i < tramos.length; i++) {
        const t = tramos[i];
        if (t.entrada === "" && t.salida === "") continue;
        if (horasTramo(t) == null) return setError(`En el tramo ${i + 1}, la salida tiene que ser después de la entrada.`);
        tramosUsados.push(t);
      }
      if (tramosUsados.length === 0) return setError("Pon la hora de entrada y la de salida.");
      if (escritas.trim() !== "" && escritasNum == null)
        return setError("El total del conduce tiene que ser un número, por ejemplo 8 o 7:30.");
      const hNum = aNumero(horometro);
      if (hNum == null || hNum <= 0) return setError("Escribe lo que marca el horómetro, por ejemplo 4523.7.");
      if (!fotoHoro && !conduce?.foto_horometro_path) return setError("Sube la foto del horómetro, donde se vean los números.");
    } else if (!fotoFirmada) {
      return setError("Escoge la foto del conduce firmado.");
    }

    setGuardando(true);
    try {
      const etiqueta = `${soloFirma ? conduce!.libreta : libreta}-${soloFirma ? conduce!.numero : num}`;
      let fotoPath = conduce?.foto_path ?? null;
      let firmadaPath = conduce?.foto_firmada_path ?? null;
      if (fotoSinFirma && !soloFirma) fotoPath = await subirFoto(fotoSinFirma, uid, `${etiqueta}-sinfirma`);
      if (fotoFirmada) firmadaPath = await subirFoto(fotoFirmada, uid, `${etiqueta}-firmado`);
      let horoPath = conduce?.foto_horometro_path ?? null;
      if (fotoHoro && !soloFirma) horoPath = await subirFoto(fotoHoro, uid, `${etiqueta}-horometro`);

      const supabase = createClient();
      let err;
      if (soloFirma) {
        ({ error: err } = await supabase.from("conduces").update({ foto_firmada_path: firmadaPath }).eq("id", conduce!.id));
      } else {
        const datos = {
          libreta,
          numero: num,
          fecha,
          machine_id: machineId,
          obra: obra.trim() || null,
          implemento: implemento === "" ? null : implemento,
          trabajo: implemento === "Otro" ? trabajo.trim() || null : null,
          tramos: tramosUsados,
          horas_calculadas: sumaTramos(tramosUsados), // la base de datos lo vuelve a calcular
          horas_escritas: escritasNum,
          foto_path: fotoPath,
          foto_firmada_path: firmadaPath,
          horometro: aNumero(horometro),
          foto_horometro_path: horoPath,
          notas: notas.trim() || null,
          parte_id: parteValida || null,
          parte_terminada: parteValida ? terminada : false,
        };
        ({ error: err } = nuevo
          ? await supabase.from("conduces").insert({ ...datos, creado_por: uid })
          : await supabase.from("conduces").update(datos).eq("id", conduce!.id));
      }
      if (err) {
        setGuardando(false);
        if (err.code === "23505") return setError(`Ya existe el conduce #${num} de la libreta ${libreta}.`);
        return setError(`No se pudo guardar: ${err.message}`);
      }
      setGuardando(false);
      onSaved();
    } catch (ex) {
      setGuardando(false);
      setError(ex instanceof Error ? ex.message : "No se pudo guardar.");
    }
  }

  async function borrar() {
    if (!conduce) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const { error: err } = await createClient().from("conduces").delete().eq("id", conduce.id);
    setGuardando(false);
    if (err) return setError(`No se pudo borrar: ${err.message}`);
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nuevo ? "Reportar el día" : `Conduce ${conduce.libreta} #${conduce.numero}`}</h2>
        {error && <div className="error">{error}</div>}

        {conduce?.estado === "Rechazado" && (
          <div className="alerta" style={{ marginBottom: 12 }}>
            El administrador lo rechazó{conduce.motivo_rechazo ? `: ${conduce.motivo_rechazo}` : "."} Corrígelo y
            vuelve a enviarlo.
          </div>
        )}

        {soloFirma ? (
          <>
            <div className="resumen">
              <div>
                {fmtFecha(conduce.fecha)} · {conduce.estado === "Aprobado" ? "Aprobado" : "Enviado"}
              </div>
              {conduce.estado === "Pendiente" && (
                <div className="aviso">
                  Está esperando la aprobación del administrador y ya no se puede cambiar. Si te equivocaste en algo,
                  avísale para que te lo devuelva.
                </div>
              )}
              {!conduce.firmado && !conduce.foto_firmada_path && (
                <div className="aviso">Falta el conduce firmado. Cuando lo tengas firmado, tómale una foto y súbela.</div>
              )}
              {!conduce.firmado && conduce.foto_firmada_path && (
                <div className="aviso">Ya subiste el firmado. El administrador lo va a revisar.</div>
              )}
              {conduce.firmado && <div>Conduce firmado y verificado.</div>}
            </div>
            {urlFirmada && (
              <a href={urlFirmada} target="_blank" rel="noreferrer">
                <img className="foto" src={urlFirmada} alt="Conduce firmado" />
              </a>
            )}
            {!conduce.firmado && (
              <div className="field">
                <label htmlFor="o-firmada">Foto del conduce firmado</label>
                <input
                  id="o-firmada"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFotoFirmada(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="o-maq">Máquina</label>
              <select id="o-maq" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                <option value="">Escoge la máquina</option>
                {maquinas.map((m) => (
                  <option key={m.machine_id} value={m.machine_id}>
                    {m.maquina_nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="o-fecha">Fecha</label>
              <input id="o-fecha" type="date" max={hoyRD()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>

            <div className="grid2">
              <div className="field">
                <label htmlFor="o-libreta">Libreta</label>
                <select id="o-libreta" value={libreta} onChange={(e) => setLibreta(e.target.value as Libreta)}>
                  <option value="FIPEC">FIPEC</option>
                  <option value="BRAU">BRAU</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="o-numero">Número del conduce</label>
                <input id="o-numero" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} />
              </div>
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
              <button type="button" className="btn small" onClick={() => setTramos((p) => [...p, { ...TRAMO_VACIO }])}>
                + Otro tramo
              </button>
            </div>

            <div className="resumen">
              Llevas <b>{fmtNum(calculadas, 2)} h</b> en este conduce
            </div>

            <div className="field">
              <label htmlFor="o-escritas">Total que escribiste en el conduce (opcional)</label>
              <input id="o-escritas" inputMode="decimal" value={escritas} onChange={(e) => setEscritas(e.target.value)} />
              <div className="hint">Puedes poner 8, 7.5 o 7:30. Las horas se calculan solas con tus entradas y salidas.</div>
            </div>

            <div className="field">
              <label htmlFor="o-horo">Horómetro: lo que marca al terminar el día</label>
              <input id="o-horo" inputMode="decimal" value={horometro} onChange={(e) => setHorometro(e.target.value)} />
              <div className="hint">Con el motor apagado. Escribe todos los números que marca el reloj, con el decimal.</div>
            </div>
            <div className="field">
              <label htmlFor="o-horo-foto">Foto del horómetro</label>
              {urlHoro && !fotoHoro && (
                <a href={urlHoro} target="_blank" rel="noreferrer">
                  <img className="foto" src={urlHoro} alt="Horómetro" />
                </a>
              )}
              <input id="o-horo-foto" type="file" accept="image/*" onChange={(e) => setFotoHoro(e.target.files?.[0] ?? null)} />
              <div className="hint">Que se vean bien los números.</div>
            </div>

            <div className="field">
              <label htmlFor="o-obra">Obra o lugar</label>
              <input id="o-obra" value={obra} onChange={(e) => setObra(e.target.value)} />
            </div>
            {partesMaquina.length > 0 && (
              <div className="field">
                <label htmlFor="o-parte">¿En cuál piscina trabajaste hoy?</label>
                <select
                  id="o-parte"
                  value={parteValida}
                  onChange={(e) => {
                    setParteId(e.target.value);
                    if (e.target.value === "") setTerminada(false);
                  }}
                >
                  <option value="">En ninguna</option>
                  {partesMaquina.map((p) => (
                    <option key={p.parte_id} value={p.parte_id}>
                      {p.parte} ({p.trabajo})
                    </option>
                  ))}
                </select>
                {parteValida && (
                  <label className="check" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={terminada} onChange={(e) => setTerminada(e.target.checked)} />
                    <span>Hoy terminé esta piscina</span>
                  </label>
                )}
              </div>
            )}
            <div className="field">
              <label htmlFor="o-impl">¿Con qué trabajaste?</label>
              <select id="o-impl" value={implemento} onChange={(e) => setImplemento(e.target.value as Implemento | "")}>
                <option value="">Escoge uno</option>
                {IMPLEMENTOS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            {implemento === "Otro" && (
              <div className="field">
                <label htmlFor="o-trabajo">¿Qué trabajo hiciste?</label>
                <input id="o-trabajo" value={trabajo} onChange={(e) => setTrabajo(e.target.value)} />
              </div>
            )}

            <div className="field">
              <label htmlFor="o-foto">Foto del conduce (aunque todavía no esté firmado)</label>
              {urlSinFirma && !fotoSinFirma && (
                <a href={urlSinFirma} target="_blank" rel="noreferrer">
                  <img className="foto" src={urlSinFirma} alt="Conduce" />
                </a>
              )}
              <input id="o-foto" type="file" accept="image/*" onChange={(e) => setFotoSinFirma(e.target.files?.[0] ?? null)} />
            </div>
            <div className="field">
              <label htmlFor="o-firmada">Foto del conduce firmado (si ya lo firmaron)</label>
              {urlFirmada && !fotoFirmada && (
                <a href={urlFirmada} target="_blank" rel="noreferrer">
                  <img className="foto" src={urlFirmada} alt="Conduce firmado" />
                </a>
              )}
              <input id="o-firmada" type="file" accept="image/*" onChange={(e) => setFotoFirmada(e.target.files?.[0] ?? null)} />
              <div className="hint">Si hoy no lo firman, lo subes después desde este mismo conduce.</div>
            </div>

            <div className="field">
              <label htmlFor="o-notas">Notas</label>
              <textarea id="o-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </>
        )}

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Enviando..." : soloFirma ? "Subir firmado" : nuevo ? "Enviar" : "Guardar y enviar"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {!nuevo && conduce?.estado === "Rechazado" && (
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
