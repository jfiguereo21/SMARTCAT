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
  type Moneda,
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
  const [descuentaComb, setDescuentaComb] = useState(machine?.descuenta_combustible_dueno ?? false);
  const [costo, setCosto] = useState(txt(machine?.costo_compra));
  const [costoMoneda, setCostoMoneda] = useState<Moneda>(machine?.costo_moneda ?? "USD");
  const [cuota, setCuota] = useState(txt(machine?.prestamo_cuota));
  const [cuotaMoneda, setCuotaMoneda] = useState<Moneda>(machine?.prestamo_moneda ?? "USD");
  const [cuotaDia, setCuotaDia] = useState(txt(machine?.prestamo_dia));
  const [cuotasTotal, setCuotasTotal] = useState(txt(machine?.prestamo_cuotas));
  const [primeraCuota, setPrimeraCuota] = useState(machine?.prestamo_primera ?? "");
  const [pendiente, setPendiente] = useState(txt(machine?.compra_pendiente));
  const [prima, setPrima] = useState(txt(machine?.seguro_prima_anual));
  const [primaMoneda, setPrimaMoneda] = useState<Moneda>(machine?.seguro_moneda ?? "USD");
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

    const costoNum = aNumero(costo);
    if (costo.trim() !== "" && (costoNum == null || costoNum < 0)) return setError("Lo que costó la máquina tiene que ser un número.");
    const cuotaNum = aNumero(cuota);
    if (cuota.trim() !== "" && (cuotaNum == null || cuotaNum < 0)) return setError("La cuota del préstamo tiene que ser un número.");
    const pendienteNum = aNumero(pendiente);
    if (pendiente.trim() !== "" && (pendienteNum == null || pendienteNum < 0)) return setError("Lo que falta por pagar tiene que ser un número.");
    const primaNum = aNumero(prima);
    if (prima.trim() !== "" && (primaNum == null || primaNum < 0)) return setError("La prima del seguro tiene que ser un número.");
    const diaNum = aNumero(cuotaDia);
    const cuotasNum = aNumero(cuotasTotal);
    if (cuotaNum != null && cuotaNum > 0) {
      if (diaNum == null || !Number.isInteger(diaNum) || diaNum < 1 || diaNum > 31)
        return setError("Pon el día del mes en que se paga la cuota, del 1 al 31.");
      if (cuotasNum == null || !Number.isInteger(cuotasNum) || cuotasNum < 1)
        return setError("Pon cuántas cuotas son en total, por ejemplo 18.");
      if (primeraCuota === "") return setError("Pon la fecha de la primera cuota.");
    }
    const hayCuota = cuotaNum != null && cuotaNum > 0;

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
      descuenta_combustible_dueno: propiedad === "Subcontratada" ? descuentaComb : false,
      costo_compra: costoNum,
      costo_moneda: costoMoneda,
      compra_pendiente: pendienteNum,
      seguro_prima_anual: primaNum,
      seguro_moneda: primaMoneda,
      prestamo_cuota: hayCuota ? cuotaNum : null,
      prestamo_moneda: cuotaMoneda,
      prestamo_dia: hayCuota ? diaNum : null,
      prestamo_cuotas: hayCuota ? cuotasNum : null,
      prestamo_primera: hayCuota ? primeraCuota : null,
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
          <>
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
          <div className="field">
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={descuentaComb}
                onChange={(e) => setDescuentaComb(e.target.checked)}
                style={{ width: "auto" }}
              />
              Descontarle al dueño el combustible que le echan
            </label>
            <div className="hint">
              En la pantalla Corte se muestra: horas × pago por hora − combustible (el del cliente al precio del día 25).
            </div>
          </div>
          </>
        )}

        {propiedad === "Propia" && (
          <>
            <h3 style={{ margin: "16px 0 4px" }}>Compra, seguro y préstamo</h3>
            <div className="hint" style={{ marginBottom: 8 }}>
              Sirve para la pantalla Ganancia por máquina. Si la máquina no tiene préstamo, deja la cuota vacía.
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="f-costo">Lo que costó la máquina</label>
                <input id="f-costo" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f-costo-m">Moneda</label>
                <select id="f-costo-m" value={costoMoneda} onChange={(e) => setCostoMoneda(e.target.value as Moneda)}>
                  <option value="USD">US$ (dólares)</option>
                  <option value="DOP">RD$ (pesos)</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-pend">Falta por pagar de la compra (por ejemplo la placa)</label>
              <input id="f-pend" inputMode="decimal" value={pendiente} onChange={(e) => setPendiente(e.target.value)} />
              <div className="hint">En la misma moneda de lo que costó la máquina.</div>
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="f-prima">Prima del seguro por año</label>
                <input id="f-prima" inputMode="decimal" value={prima} onChange={(e) => setPrima(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f-prima-m">Moneda del seguro</label>
                <select id="f-prima-m" value={primaMoneda} onChange={(e) => setPrimaMoneda(e.target.value as Moneda)}>
                  <option value="USD">US$ (dólares)</option>
                  <option value="DOP">RD$ (pesos)</option>
                </select>
              </div>
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="f-cuota">Cuota mensual del préstamo</label>
                <input id="f-cuota" inputMode="decimal" value={cuota} onChange={(e) => setCuota(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f-cuota-m">Moneda de la cuota</label>
                <select id="f-cuota-m" value={cuotaMoneda} onChange={(e) => setCuotaMoneda(e.target.value as Moneda)}>
                  <option value="USD">US$ (dólares)</option>
                  <option value="DOP">RD$ (pesos)</option>
                </select>
              </div>
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="f-cuota-d">Día del mes que se paga</label>
                <input id="f-cuota-d" inputMode="numeric" value={cuotaDia} onChange={(e) => setCuotaDia(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f-cuotas">Cuotas en total</label>
                <input id="f-cuotas" inputMode="numeric" value={cuotasTotal} onChange={(e) => setCuotasTotal(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-primera">Fecha de la primera cuota</label>
              <input id="f-primera" type="date" value={primeraCuota} onChange={(e) => setPrimeraCuota(e.target.value)} />
            </div>
          </>
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
