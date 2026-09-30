import { useEffect, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './ui';

export function Modal({ open, onClose, title, description, children, onSubmit, submitLabel = 'Save changes', busy = false, wide = false }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; onSubmit?: (event: FormEvent<HTMLFormElement>) => void; submitLabel?: string; busy?: boolean; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);
  return <AnimatePresence>{open && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div className={`modal-card ${wide ? 'modal-wide' : ''}`} initial={{ opacity: 0, y: 20, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }} transition={{ duration: .2 }} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-header"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
      {onSubmit ? <form onSubmit={onSubmit}><div className="modal-body">{children}</div><div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <span className="mini-spinner" />}{busy ? 'Saving…' : submitLabel}</Button></div></form> : <div className="modal-body">{children}</div>}
    </motion.div>
  </motion.div>}</AnimatePresence>;
}
