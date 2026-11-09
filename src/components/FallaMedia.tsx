"use client";

import { useFallaUrl } from "@/lib/fallas";

export function FotoFalla({ path, onQuitar }: { path: string; onQuitar?: () => void }) {
  const url = useFallaUrl(path);
  return (
    <div style={{ marginBottom: 8 }}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img className="foto" src={url} alt="Foto de la falla" />
        </a>
      ) : (
        <div className="hint">Cargando foto...</div>
      )}
      {onQuitar && (
        <button type="button" className="btn small danger" onClick={onQuitar}>
          Quitar esta foto
        </button>
      )}
    </div>
  );
}

export function VideoFalla({ path }: { path: string }) {
  const url = useFallaUrl(path);
  if (!url) return <div className="hint">Cargando video...</div>;
  return (
    <div style={{ marginBottom: 8 }}>
      <video className="foto" src={url} controls playsInline preload="metadata" />
      <a href={url} target="_blank" rel="noreferrer" className="hint">
        Abrir el video aparte
      </a>
    </div>
  );
}
