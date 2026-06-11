'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, Plus, Trash2, Package, AlertTriangle } from 'lucide-react';

export interface SkuItem {
  id: string;
  picking_name: string;
  detalle: string;
  sku: string;
  created_at: string;
}

interface SkuModalProps {
  open: boolean;
  pickingName: string;
  detalle: string;
  onClose: () => void;
  onChange: () => void;
}

export default function SkuModal({ open, pickingName, detalle, onClose, onChange }: SkuModalProps) {
  const [skus, setSkus]                   = useState<SkuItem[]>([]);
  const [loading, setLoading]             = useState(false);
  const [adding, setAdding]               = useState(false);
  const [newSku, setNewSku]               = useState('');
  const [error, setError]                 = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar SKUs
  useEffect(() => {
    if (!open || !pickingName) return;
    setSkus([]);
    setError('');
    setPendingDelete(null);
    setLoading(true);
    fetch(`/api/control-cruce/skus?picking_name=${encodeURIComponent(pickingName)}&detalle=${encodeURIComponent(detalle)}`)
      .then(r => r.json())
      .then((d: { data?: SkuItem[] }) => setSkus(d.data ?? []))
      .catch(() => setError('Error al cargar SKUs'))
      .finally(() => setLoading(false));
  }, [open, pickingName, detalle]);

  // Escape para cerrar
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus input al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function addSku() {
    const val = newSku.trim();
    if (!val || adding) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/control-cruce/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picking_name: pickingName, detalle, sku: val }),
      });
      const data = await res.json() as { data?: SkuItem; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? 'Error al agregar'); return; }
      if (data.data) setSkus(prev => [...prev, data.data!]);
      setNewSku('');
      onChange();
    } catch {
      setError('Error al agregar');
    } finally {
      setAdding(false);
    }
  }

  function handleDeleteClick(item: SkuItem) {
    if (pendingDelete === item.id) {
      removeSku(item);
      setPendingDelete(null);
    } else {
      setPendingDelete(item.id);
      setTimeout(() => setPendingDelete(p => p === item.id ? null : p), 2500);
    }
  }

  async function removeSku(item: SkuItem) {
    try {
      const res = await fetch('/api/control-cruce/skus', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) { setError('Error al eliminar'); return; }
      setSkus(prev => prev.filter(s => s.id !== item.id));
      onChange();
    } catch {
      setError('Error al eliminar');
    }
  }

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12, padding: 0, width: 420, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={16} style={{ color: '#93C5FD' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
              SKUs — {pickingName}
            </span>
            {detalle && (
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                background: detalle.toUpperCase().includes('FALTANTE') ? 'rgba(220,38,38,0.7)'
                  : detalle.toUpperCase().includes('SOBRANTE') ? 'rgba(217,119,6,0.7)'
                  : 'rgba(146,64,14,0.7)',
                color: '#fff', borderRadius: 4, padding: '2px 7px',
              }}>{detalle}</span>
            )}
            <span style={{
              fontSize: 11, color: 'rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.07)', borderRadius: 4,
              padding: '1px 7px',
            }}>
              {skus.length}
            </span>
          </div>
          <button
            onClick={onClose}
            title="Cerrar (Esc)"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', padding: 4, display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Lista de SKUs */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 20 }}>
              Cargando…
            </div>
          ) : skus.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center', padding: 20 }}>
              Sin SKUs registrados. Agrega el primero abajo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {skus.map(item => {
                const isPending = pendingDelete === item.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: isPending ? 'rgba(220,38,38,0.15)' : 'rgba(59,130,246,0.12)',
                      border: isPending ? '1px solid rgba(220,38,38,0.45)' : '1px solid rgba(59,130,246,0.25)',
                      borderRadius: 6, padding: '7px 10px',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <span style={{
                      fontFamily: 'monospace', fontSize: 13, fontWeight: 600,
                      color: isPending ? '#FCA5A5' : '#93C5FD',
                    }}>
                      {item.sku}
                    </span>
                    <button
                      onClick={() => handleDeleteClick(item)}
                      title={isPending ? 'Click de nuevo para confirmar' : 'Eliminar SKU'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: isPending ? 'rgba(220,38,38,0.25)' : 'none',
                        border: isPending ? '1px solid rgba(220,38,38,0.5)' : 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        color: isPending ? '#FCA5A5' : 'rgba(220,38,38,0.6)',
                        padding: isPending ? '2px 7px' : 2,
                        fontSize: 10, fontWeight: 700,
                        transition: 'all 0.15s',
                      }}
                    >
                      <Trash2 size={13} />
                      {isPending && <span>Confirmar</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Input para agregar */}
        <div style={{
          padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', gap: 8,
        }}>
          <input
            ref={inputRef}
            value={newSku}
            onChange={e => setNewSku(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSku(); }}
            placeholder="Escribe el SKU…"
            disabled={adding}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
              color: '#fff', padding: '8px 12px', fontSize: 13,
              fontFamily: 'monospace', outline: 'none',
            }}
          />
          <button
            onClick={addSku}
            disabled={!newSku.trim() || adding}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: newSku.trim() ? 'rgba(22,163,74,0.85)' : 'rgba(255,255,255,0.07)',
              border: 'none', borderRadius: 6,
              color: newSku.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
              padding: '8px 14px', fontSize: 12, fontWeight: 600,
              cursor: newSku.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={14} />
            {adding ? '…' : 'Agregar'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '6px 18px 10px', fontSize: 11, color: '#FCA5A5',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <AlertTriangle size={11} />
            {error}
          </div>
        )}

        {/* Hint Escape */}
        <div style={{
          padding: '4px 18px 8px', fontSize: 10,
          color: 'rgba(255,255,255,0.18)', textAlign: 'right',
        }}>
          Esc para cerrar · Click dos veces para eliminar
        </div>
      </div>
    </div>
  );
}
