import type { ReactNode } from 'react';
export function SectionTitle({ title, aside }: { title: string; aside?: ReactNode }) { return <div className="section-title"><h3>{title}</h3>{aside}</div>; }
