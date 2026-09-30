import type { ChangeEvent } from 'react';
import { Paperclip } from 'lucide-react';

export interface FieldOption { label: string; value: string }
export interface FieldConfig { name: string; label: string; type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'datetime-local' | 'select' | 'textarea'; required?: boolean; placeholder?: string; options?: FieldOption[]; rows?: number; hint?: string; step?: string; min?: string; max?: string; full?: boolean }
export function FormFields({ fields, values, onChange }: { fields: FieldConfig[]; values: Record<string, any>; onChange: (name: string, value: string) => void }) {
  return <div className="form-grid">{fields.map((field) => <label key={field.name} className={`form-field ${field.full ? 'field-full' : ''}`}>
    <span>{field.label}{field.required && <b className="required-dot">*</b>}</span>
    {field.type === 'textarea' ? <textarea required={field.required} rows={field.rows || 3} placeholder={field.placeholder} value={values[field.name] ?? ''} onChange={(event) => onChange(field.name, event.target.value)} />
      : field.type === 'select' ? <select required={field.required} value={values[field.name] ?? ''} onChange={(event) => onChange(field.name, event.target.value)}><option value="">Select {field.label.toLowerCase()}</option>{field.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
        : <input type={field.type || 'text'} required={field.required} min={field.min} max={field.max} step={field.step} placeholder={field.placeholder} value={values[field.name] ?? ''} onChange={(event) => onChange(field.name, event.target.value)} />}
    {field.hint && <small>{field.hint}</small>}
  </label>)}</div>;
}

export function UploadField({ onChange, multiple = true, accept = 'image/*,.pdf,.doc,.docx', files = [] }: { onChange: (files: FileList | null) => void; multiple?: boolean; accept?: string; files?: { name: string }[] }) {
  return <div className="upload-field"><label className="upload-drop"><input type="file" accept={accept} multiple={multiple} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.files)} /><span className="upload-icon"><Paperclip size={17} /></span><span><b>Attach evidence</b><small>JPG, PNG, PDF · up to 10 MB each</small></span><span className="upload-action">Browse files</span></label>
    {files.length > 0 && <div className="upload-file-list">{files.map((file, index) => <div key={`${file.name}-${index}`}>{file.name}</div>)}</div>}
  </div>;
}
