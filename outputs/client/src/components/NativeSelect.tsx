import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

/** Keep native selection/keyboard behavior, with one consistently centered arrow. */
export function NativeSelect({ wrapperClassName = '', className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return <span className={`settings-select ${wrapperClassName}`}>
    <select {...props} className={`field-input ${className}`} />
    <span className="settings-select-indicator" aria-hidden="true"><ChevronDown size={14} strokeWidth={1.6} /></span>
  </span>;
}
