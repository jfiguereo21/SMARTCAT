"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subirFoto, useFotoUrl } from "@/lib/fotos";

// Lo que ve el operador (y el administrador): la foto del voucher de un pago.
export function VerVoucher({ path }: { path: string }) {
  const url = useFotoUrl(path);
  if (!url) return <div className="hint">Cargando voucher...</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="foto" src={url} alt="Voucher del pago" />
    </a>
  );
}

// Para el operador: un botón pequeño que abre el voucher en una ventana, sin ocupar espacio en la pantalla.
export function BotonVoucher({ path }: { path: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="btn small" onClick={() => setAbierto(true)}>
        Ver voucher
      </button>
      {abierto && (
        <div className="sheet-bg" onClick={() => setAbierto(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Voucher del pago</h2>
            <VerVoucher path={path} />
            <div className="actions">
              <button type="button" className="btn grow" onClick={() => setAbierto(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Selector del voucher para usar mientras se registra un pago.
export function CampoVoucher({
  id,
  archivo,
  onChange,
}: {
  id: string;
  archivo: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>Voucher del pago (foto o captura)</label>
      <input id={id} type="file" accept="image/*" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      <div className="hint">
        {archivo ? "Se sube al registrar el pago." : "El operador lo ve en su celular junto a su pago."}
      </div>
    </div>
  );
}

// Sube el voucher a la carpeta del operador, para que su política de acceso le deje verlo.
export function subirVoucher(file: File, operadorId: string, etiqueta: string) {
  return subirFoto(file, operadorId, `voucher-${etiqueta}`);
}

// Para un pago ya registrado: muestra el voucher o deja subirlo (o cambiarlo) después.
export function VoucherDePago({
  pagoId,
  operadorId,
  voucherPath,
  etiqueta,
  onChanged,
}: {
  pagoId: string;
  operadorId: string;
  voucherPath: string | null;
  etiqueta: string;
  onChanged: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    if (!archivo) return;
    setError("");
    setGuardando(true);
    try {
      const ruta = await subirVoucher(archivo, operadorId, etiqueta);
      const { error: err } = await createClient().from("pagos_operador").update({ voucher_path: ruta }).eq("id", pagoId);
      if (err) {
        await createClient().storage.from("conduces").remove([ruta]);
        throw new Error(err.message);
      }
      setArchivo(null);
      setCambiando(false);
      onChanged();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "No se pudo subir el voucher.");
    }
    setGuardando(false);
  }

  const mostrarSelector = !voucherPath || cambiando;

  return (
    <div style={{ marginTop: 8 }}>
      {error && <div className="error">{error}</div>}
      {voucherPath ? <VerVoucher path={voucherPath} /> : <span className="pill">Falta el voucher</span>}
      {mostrarSelector ? (
        <>
          <CampoVoucher id={`vp-${pagoId}`} archivo={archivo} onChange={setArchivo} />
          <div className="actions">
            <button type="button" className="btn small primary" disabled={!archivo || guardando} onClick={guardar}>
              {guardando ? "Subiendo..." : "Guardar voucher"}
            </button>
            {cambiando && (
              <button type="button" className="btn small" disabled={guardando} onClick={() => setCambiando(false)}>
                Cancelar
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="actions">
          <button type="button" className="btn small" onClick={() => setCambiando(true)}>
            Cambiar voucher
          </button>
        </div>
      )}
    </div>
  );
}
