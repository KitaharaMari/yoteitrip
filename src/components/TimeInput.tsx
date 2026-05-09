'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;               // "HH:mm"
  onChange: (value: string) => void;
  isLate?: boolean;
}

export function TimeInput({ value, onChange, isLate }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="time"
        defaultValue={value}
        className="font-mono text-xs w-12 flex-none leading-none bg-transparent outline-none border-b-2 border-blue-400 text-blue-600 tabular-nums"
        onBlur={(e) => {
          if (e.target.value) onChange(e.target.value);
          setIsEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (e.currentTarget.value) onChange(e.currentTarget.value);
            setIsEditing(false);
          }
          if (e.key === 'Escape') setIsEditing(false);
        }}
      />
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      title="点击编辑时间"
      className={`font-mono text-xs w-10 flex-none leading-none text-left tabular-nums transition-colors ${
        isLate
          ? 'text-orange-400 hover:text-orange-600'
          : 'text-gray-400 hover:text-blue-500'
      }`}
    >
      {value}
    </button>
  );
}
