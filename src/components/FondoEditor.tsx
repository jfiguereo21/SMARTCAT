"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtMonto, hoyRD, type Machine } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import { subirFoto, useFotoUrl } from "@/lib/fotos";
import {
  CATEGORIAS_CON_SOCIO,
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SALIDA,
  estadoMov,
  type FondoMov,
  type OrigenMov,
  type TipoMov,
} from "@/lib/fondo";

export type Socio = { user_id: string; nombre: string };

type Props = {
  mov: FondoMov | null; // null = movimiento nuevo
  maquinas: Machine[];
  socios: Socio[];
  uid: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function FondoEditor({ mov, maquinas, socios, uid, onClose, onSaved }: Props) {
  const nuevo = mov === null;
  const nombreDe = (id: string | null) => socios.find((s) => s.user_id === id)?.nombre || "otro socio";
  const urlComp = useFotoUrl(mov?.comprobante_path);

  const [tipo, setTipo] = useState<TipoMov>(mov?.tipo ?? "Salida");
  const [fecha, setFecha] = useState(mov?.fecha ?? hoyRD());
  const [monto, setMonto] = useState(mov ? String(mov.monto) : "");
  const [categoria, setCategoria] = useState(mov?.categoria ?? "");
  const [machineId, setMachineId] = useState(mov?.machine_id ?? "");
  const [origen, setOrigen] = useState<OrigenMov>(mov?.origen ?? "Fondo");
  const [socioId, setSocioId] = useState(mov?.socio_id ?? "");
  const [descripcion, setDescripcion] = useState(mov?.descripcion ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [yaPagado, setYaPagado] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  const estado = mov ? estadoMov(mov) : null;
  const soyCreador = mov ? mov.creado_por === uid : true;
  const categorias = tipo === "Entrada" ? CATEGORIAS_ENTRADA : CATEGORIAS_SALIDA;
  const pideSocio = origen === "Bolsillo" || CATEGORIAS_CON_SOCIO.includes(categoria);
  const mNum = aNumero(monto);

  function cambiarTipo(t: TipoMov) {
    setTipo(t);
    setCategoria("");
    if (t === "Entrada") setOrigen("Fondo");
  }

  function validar(): string | null {
    if (!fecha) return "Falta la fecha.";
    if (mNum == null || mNum <= 0) return "Escribe el monto, por ejemplo 15000 o 2500.50.";
    if (!categoria) return "Escoge la categoría.";
    if (pideSocio && !socioId)
      return origen === "Bolsillo" ? "Di qué socio pagó de su bolsillo." : "Escoge el socio.";
    return null;
  }

  function datosContenido() {
    return {
      fecha,
      tipo,
      categoria,
      monto: mNum,
      machine_id: machineId || null,
      origen: tipo === "Entrada" ? "Fondo" : origen,
      socio_id: pideSocio ? socioId : null,
      descripcion: descripcion.trim() || null,
    };
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const v = validar();
    if (v) return setError(v);
    // Lo que un socio paga de su bolsillo ya se pagó: hace falta el comprobante.
    const pagadoAlCrear = nuevo && (yaPagado || origen === "Bolsillo");
    if (nuevo && tipo === "Salida" && pagadoAlCrear && !archivo)
      return setError("Para registrar un gasto ya pagado sube la foto del comprobante.");

    setGuardando(true);
    try {
      const supabase = createClient();
      const ruta = archivo ? await subirFoto(archivo, uid, "fondo") : (mov?.comprobante_path ?? null);
      if (nuevo) {
        const { error: err } = await supabase.from("fondo_movimientos").insert({
          ...datosContenido(),
          comprobante_path: ruta,
          ...(pagadoAlCrear ? { pagado_en: new Date().toISOString() } : {}),
        });
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await supabase
          .from("fondo_movimientos")
          .update({ ...datosContenido(), comprobante_path: ruta })
          .eq("id", mov.id);
        if (err) throw new Error(err.message);
      }
      onSaved();
    } catch (err) {
      setError(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`);
      setGuardando(false);
    }
  }

  async function accion(que: "aprobar" | "rechazar" | "pagar") {
    if (!mov) return;
    setError("");
    if (que === "rechazar" && motivo.trim() === "") return setError("Escribe por qué lo rechazas.");
    if (que === "pagar" && mov.tipo === "Salida" && !archivo && !mov.comprobante_path)
      return setError("Para marcarlo pagado sube la foto del comprobante.");
    setGuardando(true);
    try {
      const supabase = createClient();
      const ahora = new Date().toISOString();
      let cambios: Record<string, unknown>;
      if (que === "aprobar") cambios = { aprobado_en: ahora };
      else if (que === "rechazar") cambios = { rechazado_en: ahora, motivo_rechazo: motivo.trim() };
      else {
        const ruta = archivo ? await subirFoto(archivo, uid, "fondo") : mov.comprobante_path;
        cambios = { pagado_en: ahora, comprobante_path: ruta };
      }
      const { error: err } = await supabase.from("fondo_movimientos").update(cambios).eq("id", mov.id);
      if (err) throw new Error(err.message);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!mov) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const { error: err } = await createClient().from("fondo_movimientos").delete().eq("id", mov.id);
    if (err) {
      setGuardando(false);
      return setError(`No se pudo borrar: ${err.message}`);
    }
    onSaved();
  }

  const puedeAprobar = mov != null && !mov.aprobado_en && !mov.rechazado_en && !soyCreador;
  const puedeRechazar = puedeAprobar && !mov.pagado_en;
  const puedePagar = mov != null && !mov.pagado_en && !mov.rechazado_en && (!!mov.aprobado_en || !soyCreador);
  const puedeBorrar = mov != null && soyCreador && !mov.aprobado_en && !mov.pagado_en;

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nuevo ? "Movimiento del fondo" : `${mov.tipo} · ${estado}`}</h2>
        {error && <div className="error">{error}</div>}

        {mov && (
          <div className="resumen">
            Registrado por <b>{nombreDe(mov.creado_por)}</b> el {fmtFecha(mov.created_at.slice(0, 10))}.
            {mov.aprobado_en && (
              <>
                {" "}
                Aprobado por <b>{nombreDe(mov.aprobado_por)}</b>.
              </>
            )}
            {mov.pagado_en && (
              <>
                {" "}
                Pagado el {fmtFecha(mov.pagado_en.slice(0, 10))} por <b>{nombreDe(mov.pagado_por)}</b>.
              </>
            )}
            {mov.rechazado_en && (
              <div className="aviso">
                Rechazado por {nombreDe(mov.rechazado_por)}
                {mov.motivo_rechazo ? `: ${mov.motivo_rechazo}` : ""}. Si lo corriges, vuelve a quedar por aprobar.
              </div>
            )}
          </div>
        )}

        {urlComp && (
          <a href={urlComp} target="_blank" rel="noreferrer">
            <img className="foto" src={urlComp} alt="Comprobante" />
          </a>
        )}

        <div className="grid2">
          <div className="field">
            <label htmlFor="fm-tipo">Tipo</label>
            <select id="fm-tipo" value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoMov)}>
              <option value="Salida">Sale dinero</option>
              <option value="Entrada">Entra dinero</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="fm-fecha">Fecha</label>
            <input id="fm-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="fm-monto">Monto (RD$)</label>
            <input id="fm-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="fm-cat">Categoría</label>
            <select id="fm-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Escoge</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {tipo === "Salida" && (
          <div className="field">
            <label htmlFor="fm-origen">¿De dónde sale el dinero?</label>
            <select id="fm-origen" value={origen} onChange={(e) => setOrigen(e.target.value as OrigenMov)}>
              <option value="Fondo">Del fondo de la sociedad</option>
              <option value="Bolsillo">Un socio lo pagó de su bolsillo</option>
            </select>
            {origen === "Bolsillo" && (
              <div className="hint">No baja el fondo. Queda anotado a favor de ese socio en la cuenta con socios.</div>
            )}
          </div>
        )}

        {pideSocio && (
          <div className="field">
            <label htmlFor="fm-socio">
              {origen === "Bolsillo"
                ? "Socio que pagó"
                : categoria === "Aporte de socio"
                  ? "Socio que aporta"
                  : "Socio"}
            </label>
            <select id="fm-socio" value={socioId} onChange={(e) => setSocioId(e.target.value)}>
              <option value="">Escoge</option>
              {socios.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="fm-maq">Máquina</label>
          <select id="fm-maq" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">General (no es de una máquina)</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="fm-desc">Descripción</label>
          <input id="fm-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <div className="hint">Por ejemplo: filtro de aceite, o a quién se le pagó.</div>
        </div>

        <div className="field">
          <label htmlFor="fm-file">
            {tipo === "Entrada" ? "Comprobante del depósito" : "Comprobante del pago"} (foto o captura)
          </label>
          <input id="fm-file" type="file" accept="image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          {mov?.comprobante_path && !archivo && <div className="hint">Ya tiene un comprobante. Si subes otro, lo reemplaza.</div>}
        </div>

        {nuevo && origen === "Fondo" && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <input type="checkbox" checked={yaPagado} onChange={(e) => setYaPagado(e.target.checked)} />
            <span>Ya está {tipo === "Entrada" ? "depositado" : "pagado"}</span>
          </label>
        )}
        {nuevo && !yaPagado && origen === "Fondo" && (
          <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
            Si no, queda por aprobar: el otro socio lo aprueba y luego se paga con su comprobante.
          </div>
        )}

        {mov && !mov.rechazado_en && !mov.aprobado_en && !soyCreador && (
          <div className="field">
            <label htmlFor="fm-motivo">Si lo rechazas, ¿por qué?</label>
            <input id="fm-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        )}

        <div className="actions">
          {puedeAprobar && (
            <button type="button" className="btn primary grow" disabled={guardando} onClick={() => accion("aprobar")}>
              Aprobar
            </button>
          )}
          {puedeRechazar && (
            <button type="button" className="btn danger" disabled={guardando} onClick={() => accion("rechazar")}>
              Rechazar
            </button>
          )}
          {puedePagar && (
            <button type="button" className="btn primary grow" disabled={guardando} onClick={() => accion("pagar")}>
              {mov.tipo === "Entrada" ? "Marcar depositado" : "Marcar pagado"}
            </button>
          )}
          <button type="submit" className={nuevo ? "btn primary grow" : "btn"} disabled={guardando}>
            {guardando ? "Guardando..." : nuevo ? "Guardar" : "Guardar cambios"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {puedeBorrar && (
            <button type="button" className={`btn danger${borrarListo ? " armed" : ""}`} onClick={borrar} disabled={guardando}>
              {borrarListo ? "Toca otra vez para borrar" : "Borrar"}
            </button>
          )}
        </div>
        {mov && (puedeAprobar || puedePagar) && (
          <div className="hint">
            Para cambiar algo, guarda el cambio primero; después el otro socio lo aprueba. Monto actual:{" "}
            {fmtMonto(mov.monto, "DOP")}.
          </div>
        )}
      </form>
    </div>
  );
}
