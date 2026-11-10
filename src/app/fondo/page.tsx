"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import FondoEditor, { type Socio } from "@/components/FondoEditor";
import { aNumero, fmtMonto, hoyRD, type Machine } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import {
  cuentaSocios,
  diferenciaCuadre,
  estadoMov,
  necesitaMiAccion,
  saldoFondo,
  type EstadoMov,
  type FondoConfig,
  type FondoMov,
} from "@/lib/fondo";

type Vista = "movimientos" | "socios" | "cuadre";
type Filtro = "todos" | EstadoMov;
type PagoOpFila = { id: string; user_id: string; fecha_pago: string; neto: number };
type Cuadre = { id: string; fecha: string; saldo_banco: number; saldo_app: number; nota: string | null };

const rd = (n: number) => fmtMonto(n, "DOP");

export default function FondoPage() {
  const [uid, setUid] = useState("");
  const [config, setConfig] = useState<FondoConfig | null>(null);
  const [movs, setMovs] = useState<FondoMov[]>([]);
  const [pagosOp, setPagosOp] = useState<PagoOpFila[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [perfiles, setPerfiles] = useState<(Socio & { rol: string })[]>([]);
  const [cuadres, setCuadres] = useState<Cuadre[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [vista, setVista] = useState<Vista>("movimientos");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  // undefined = editor cerrado, null = movimiento nuevo
  const [editando, setEditando] = useState<FondoMov | null | undefined>(undefined);

  // Inicio del fondo
  const [saldoIni, setSaldoIni] = useState("");
  const [fechaIni, setFechaIni] = useState(hoyRD());
  const [editandoInicio, setEditandoInicio] = useState(false);
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Cuadre
  const [bancoTxt, setBancoTxt] = useState("");
  const [notaCuadre, setNotaCuadre] = useState("");

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    setUid(u.user?.id ?? "");
    const [c, m, po, mq, pf, cu] = await Promise.all([
      supabase.from("fondo_config").select("saldo_inicial, fecha_inicial").maybeSingle(),
      supabase
        .from("fondo_movimientos")
        .select("*, machines(nombre)")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("pagos_operador").select("id, user_id, fecha_pago, neto"),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("perfiles").select("user_id, nombre, rol"),
      supabase.from("fondo_cuadres").select("*").order("created_at", { ascending: false }).limit(12),
    ]);
    const fallo = c.error ?? m.error ?? po.error ?? mq.error ?? pf.error ?? cu.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setConfig(
        c.data
          ? { saldo_inicial: Number(c.data.saldo_inicial), fecha_inicial: c.data.fecha_inicial }
          : { saldo_inicial: 0, fecha_inicial: null }
      );
      setMovs(((m.data ?? []) as unknown as FondoMov[]).map((x) => ({ ...x, monto: Number(x.monto) })));
      setPagosOp(((po.data ?? []) as PagoOpFila[]).map((x) => ({ ...x, neto: Number(x.neto) })));
      setMaquinas((mq.data ?? []) as Machine[]);
      setPerfiles((pf.data ?? []) as (Socio & { rol: string })[]);
      setCuadres(
        ((cu.data ?? []) as Cuadre[]).map((x) => ({
          ...x,
          saldo_banco: Number(x.saldo_banco),
          saldo_app: Number(x.saldo_app),
        }))
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const socios = useMemo(() => perfiles.filter((p) => p.rol === "admin" || p.rol === "socio"), [perfiles]);
  const nombreDe = useCallback(
    (id: string | null) => perfiles.find((p) => p.user_id === id)?.nombre || "—",
    [perfiles]
  );
  const iniciado = config?.fecha_inicial != null;
  const saldo = useMemo(
    () => saldoFondo(config ?? { saldo_inicial: 0, fecha_inicial: null }, movs, pagosOp),
    [config, movs, pagosOp]
  );
  const cuentas = useMemo(
    () => cuentaSocios(movs, socios.map((s) => s.user_id)),
    [movs, socios]
  );
  const esperan = useMemo(() => movs.filter((m) => necesitaMiAccion(m, uid)), [movs, uid]);

  // Movimientos y pagos a operadores en una sola lista, del más nuevo al más viejo.
  type Fila = { clave: string; fecha: string; mov?: FondoMov; pago?: PagoOpFila };
  const filas = useMemo(() => {
    const lista: Fila[] = movs
      .filter((m) => filtro === "todos" || estadoMov(m) === filtro)
      .map((m) => ({ clave: m.id, fecha: m.fecha, mov: m }));
    if (filtro === "todos" || filtro === "Pagado") {
      for (const p of pagosOp)
        if (iniciado && p.fecha_pago >= (config?.fecha_inicial ?? ""))
          lista.push({ clave: `p-${p.id}`, fecha: p.fecha_pago, pago: p });
    }
    return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)).slice(0, 150);
  }, [movs, pagosOp, filtro, iniciado, config]);

  async function guardarInicio() {
    setMsg("");
    const n = aNumero(saldoIni);
    if (n == null || n < 0) return setMsg("Escribe el saldo con que empieza el fondo, por ejemplo 250000.");
    if (!fechaIni) return setMsg("Falta la fecha desde la que cuenta el fondo.");
    setGuardando(true);
    const { error: err } = await createClient()
      .from("fondo_config")
      .update({ saldo_inicial: n, fecha_inicial: fechaIni })
      .eq("id", true);
    setGuardando(false);
    if (err) return setMsg(`No se pudo guardar: ${err.message}`);
    setEditandoInicio(false);
    cargar();
  }

  const bancoNum = aNumero(bancoTxt);
  const dif = bancoNum != null ? diferenciaCuadre(bancoNum, saldo.saldo) : null;

  async function guardarCuadre() {
    setMsg("");
    if (bancoNum == null || bancoNum < 0) return setMsg("Escribe lo que dice el banco hoy.");
    setGuardando(true);
    const { error: err } = await createClient()
      .from("fondo_cuadres")
      .insert({ fecha: hoyRD(), saldo_banco: bancoNum, saldo_app: saldo.saldo, nota: notaCuadre.trim() || null });
    setGuardando(false);
    if (err) return setMsg(`No se pudo guardar: ${err.message}`);
    setBancoTxt("");
    setNotaCuadre("");
    cargar();
  }

  const FILTROS: Filtro[] = ["todos", "Por aprobar", "Por pagar", "Pagado", "Rechazado"];

  return (
    <main className="wrap">
      <Nav activa="fondo" />
      <div className="top">
        <h1>Fondo</h1>
        <button className="btn primary" onClick={() => setEditando(null)}>
          + Movimiento
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {!cargando && !iniciado && !editandoInicio ? (
        <div className="resumen">
          <b>Empieza el fondo</b>
          <div className="hint">
            Pon cuánto dinero hay hoy en la cuenta de la sociedad y desde qué fecha SmartCat empieza a contar.
          </div>
          <FormInicio
            saldoIni={saldoIni}
            fechaIni={fechaIni}
            setSaldoIni={setSaldoIni}
            setFechaIni={setFechaIni}
            guardar={guardarInicio}
            guardando={guardando}
            msg={msg}
          />
        </div>
      ) : (
        !cargando && (
          <>
            <div className="resumen" style={{ textAlign: "center" }}>
              <div className="total-n">Saldo del fondo</div>
              <div className="total-h" style={{ fontSize: 32, color: saldo.saldo < 0 ? "var(--danger)" : undefined }}>
                {rd(saldo.saldo)}
              </div>
              {saldo.porPagar > 0 && <div className="total-c">Hay {rd(saldo.porPagar)} aprobado por pagar.</div>}
            </div>
            <div className="totales">
              <div className="total">
                <div className="total-n">Saldo inicial</div>
                <div className="total-h" style={{ fontSize: 18 }}>{rd(saldo.inicial)}</div>
                <div className="total-c">
                  desde {config?.fecha_inicial ? fmtFecha(config.fecha_inicial) : ""}{" "}
                  <button type="button" className="btn small" onClick={() => {
                    setSaldoIni(String(config?.saldo_inicial ?? ""));
                    setFechaIni(config?.fecha_inicial ?? hoyRD());
                    setEditandoInicio(true);
                  }}>Cambiar</button>
                </div>
              </div>
              <div className="total">
                <div className="total-n">Entradas</div>
                <div className="total-h" style={{ fontSize: 18 }}>{rd(saldo.entradas)}</div>
              </div>
              <div className="total">
                <div className="total-n">Gastos pagados</div>
                <div className="total-h" style={{ fontSize: 18 }}>{rd(saldo.salidas)}</div>
              </div>
              <div className="total">
                <div className="total-n">Pagos a operadores</div>
                <div className="total-h" style={{ fontSize: 18 }}>{rd(saldo.operadores)}</div>
                <div className="total-c">automático</div>
              </div>
            </div>
            {editandoInicio && (
              <div className="resumen">
                <b>Cambiar el inicio del fondo</b>
                <FormInicio
                  saldoIni={saldoIni}
                  fechaIni={fechaIni}
                  setSaldoIni={setSaldoIni}
                  setFechaIni={setFechaIni}
                  guardar={guardarInicio}
                  guardando={guardando}
                  msg={msg}
                  cancelar={() => setEditandoInicio(false)}
                />
              </div>
            )}
          </>
        )
      )}

      {esperan.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Esperan tu acción ({esperan.length})</h2>
          {esperan.map((m) => (
            <Tarjeta key={m.id} m={m} nombreDe={nombreDe} onClick={() => setEditando(m)} />
          ))}
        </>
      )}

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={vista === "movimientos" ? "tab on" : "tab"} onClick={() => setVista("movimientos")}>
          Movimientos
        </button>
        <button className={vista === "socios" ? "tab on" : "tab"} onClick={() => setVista("socios")}>
          Cuenta con socios
        </button>
        <button className={vista === "cuadre" ? "tab on" : "tab"} onClick={() => setVista("cuadre")}>
          Cuadre
        </button>
      </div>

      {vista === "movimientos" && (
        <>
          <div className="field">
            <label htmlFor="fo-filtro">Mostrar</label>
            <select id="fo-filtro" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
              {FILTROS.map((f) => (
                <option key={f} value={f}>
                  {f === "todos" ? "Todos" : f}
                </option>
              ))}
            </select>
          </div>
          {cargando ? (
            <div className="empty">Cargando...</div>
          ) : filas.length === 0 ? (
            <div className="empty">No hay movimientos todavía. Toca “+ Movimiento” para anotar el primero.</div>
          ) : (
            filas.map((f) =>
              f.mov ? (
                <Tarjeta key={f.clave} m={f.mov} nombreDe={nombreDe} onClick={() => setEditando(f.mov!)} />
              ) : (
                <div key={f.clave} className="card" style={{ cursor: "default" }}>
                  <div className="row">
                    <div>
                      <h2>Pago a {nombreDe(f.pago!.user_id)}</h2>
                      <span className="pill disp">Automático</span>
                      <div className="line">Operador · {fmtFecha(f.pago!.fecha_pago)}</div>
                    </div>
                    <div className="horas" style={{ fontSize: 20 }}>
                      −{rd(f.pago!.neto)}
                    </div>
                  </div>
                </div>
              )
            )
          )}
        </>
      )}

      {vista === "socios" && (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>
            Aquí se ve lo que la sociedad le debe a cada socio (o lo que él le debe a la sociedad). Lo que paga cada
            socio de su bolsillo no baja el fondo; se anota aquí.
          </div>
          {cuentas.map((c) => (
            <div className="resumen" key={c.socio_id}>
              <b>{nombreDe(c.socio_id)}</b>
              <div className="line">Puso en el fondo: {rd(c.aportes)}</div>
              <div className="line">Pagó de su bolsillo: {rd(c.adelantos)}</div>
              <div className="line">Ya se le devolvió: {rd(c.reembolsos)}</div>
              <div className="total-h" style={{ fontSize: 20, marginTop: 6 }}>
                {c.saldo >= 0 ? "La sociedad le debe" : "Debe a la sociedad"} {rd(Math.abs(c.saldo))}
              </div>
              <div className="line">Repartos de ganancia recibidos: {rd(c.repartos)}</div>
              {c.sinAprobar > 0 && (
                <div className="aviso">{c.sinAprobar} movimiento(s) de este socio sin aprobar por el otro.</div>
              )}
            </div>
          ))}
          {socios.length < 2 && (
            <div className="aviso">
              Todavía falta crear el usuario del socio (rol “socio”) para que vea y apruebe desde su celular.
            </div>
          )}
        </>
      )}

      {vista === "cuadre" && (
        <>
          <div className="resumen">
            <b>Cuadre con el banco</b>
            <div className="hint">
              Mira el saldo de la cuenta de la sociedad en el banco y escríbelo. SmartCat lo compara con su saldo y te
              dice la diferencia.
            </div>
            <div className="line">Saldo según SmartCat: <b>{rd(saldo.saldo)}</b></div>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="fo-banco">Saldo según el banco (RD$)</label>
              <input id="fo-banco" inputMode="decimal" value={bancoTxt} onChange={(e) => setBancoTxt(e.target.value)} />
            </div>
            {dif != null && (
              <div className={dif === 0 ? "line" : "alerta"}>
                {dif === 0
                  ? "Cuadra perfecto."
                  : dif > 0
                    ? `El banco tiene ${rd(dif)} MÁS que SmartCat: falta anotar una entrada o hay un gasto de más.`
                    : `El banco tiene ${rd(-dif)} MENOS que SmartCat: falta anotar un gasto o un retiro.`}
              </div>
            )}
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="fo-nota">Nota</label>
              <input id="fo-nota" value={notaCuadre} onChange={(e) => setNotaCuadre(e.target.value)} />
            </div>
            {msg && <div className="error">{msg}</div>}
            <div className="actions">
              <button className="btn primary grow" disabled={guardando || bancoNum == null} onClick={guardarCuadre}>
                Guardar este cuadre
              </button>
            </div>
          </div>
          {cuadres.map((c) => {
            const d = diferenciaCuadre(c.saldo_banco, c.saldo_app);
            return (
              <div className="card" key={c.id} style={{ cursor: "default" }}>
                <div className="row">
                  <div>
                    <h2>{fmtFecha(c.fecha)}</h2>
                    <div className="line">
                      Banco {rd(c.saldo_banco)} · SmartCat {rd(c.saldo_app)}
                    </div>
                    {c.nota && <div className="line">{c.nota}</div>}
                  </div>
                  <span className={d === 0 ? "pill disp" : "pill taller"}>{d === 0 ? "Cuadra" : `Dif. ${rd(d)}`}</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {editando !== undefined && (
        <FondoEditor
          key={editando?.id ?? "nuevo"}
          mov={editando}
          maquinas={maquinas}
          socios={socios}
          uid={uid}
          onClose={() => setEditando(undefined)}
          onSaved={() => {
            setEditando(undefined);
            cargar();
          }}
        />
      )}
    </main>
  );
}

function Tarjeta({
  m,
  nombreDe,
  onClick,
}: {
  m: FondoMov;
  nombreDe: (id: string | null) => string;
  onClick: () => void;
}) {
  const e = estadoMov(m);
  const clase = e === "Pagado" ? "pill disp" : e === "Rechazado" ? "pill taller" : "pill obra";
  const detalle = [
    m.machines?.nombre ?? "General",
    fmtFecha(m.fecha),
    m.socio_id ? nombreDe(m.socio_id) : null,
    m.origen === "Bolsillo" ? "de su bolsillo" : null,
    m.descripcion,
  ].filter(Boolean);
  return (
    <button className="card" onClick={onClick}>
      <div className="row">
        <div>
          <h2>{m.categoria}</h2>
          <span className={clase}>{e}</span>
          {m.pagado_en && !m.aprobado_en && (
            <span className="pill taller" style={{ marginLeft: 6 }}>
              Sin aprobar
            </span>
          )}
          <div className="line">{detalle.join(" · ")}</div>
        </div>
        <div className="horas" style={{ fontSize: 20 }}>
          {m.tipo === "Entrada" ? "+" : "−"}
          {fmtMonto(m.monto, "DOP")}
        </div>
      </div>
      {!m.comprobante_path && m.tipo === "Salida" && m.pagado_en == null && (
        <div className="aviso">Falta el comprobante para pagarlo.</div>
      )}
    </button>
  );
}

function FormInicio({
  saldoIni,
  fechaIni,
  setSaldoIni,
  setFechaIni,
  guardar,
  guardando,
  msg,
  cancelar,
}: {
  saldoIni: string;
  fechaIni: string;
  setSaldoIni: (v: string) => void;
  setFechaIni: (v: string) => void;
  guardar: () => void;
  guardando: boolean;
  msg: string;
  cancelar?: () => void;
}) {
  return (
    <>
      <div className="grid2" style={{ marginTop: 8 }}>
        <div className="field">
          <label htmlFor="fi-saldo">Saldo hoy (RD$)</label>
          <input id="fi-saldo" inputMode="decimal" value={saldoIni} onChange={(e) => setSaldoIni(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="fi-fecha">Cuenta desde</label>
          <input id="fi-fecha" type="date" value={fechaIni} onChange={(e) => setFechaIni(e.target.value)} />
        </div>
      </div>
      {msg && <div className="error">{msg}</div>}
      <div className="actions">
        <button className="btn primary grow" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        {cancelar && (
          <button className="btn" onClick={cancelar} disabled={guardando}>
            Cancelar
          </button>
        )}
      </div>
    </>
  );
}
